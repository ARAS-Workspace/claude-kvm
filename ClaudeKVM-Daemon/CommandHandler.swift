import Foundation

extension ClaudeKVMDaemon {

    // MARK: - Command Loop

    func runCommandLoop(vnc: VNCBridge, input: InputController, scaling: DisplayScaling) async {
        let stdin = FileHandle.standardInput

        let stdinStream = AsyncStream<Data> { continuation in
            DispatchQueue.global(qos: .userInteractive).async {
                while true {
                    let data = stdin.availableData
                    if data.isEmpty {
                        continuation.finish()
                        return
                    }
                    continuation.yield(data)
                }
            }
        }

        var buffer = Data()

        for await chunk in stdinStream {
            buffer.append(chunk)

            while let newlineIndex = buffer.firstIndex(of: UInt8(ascii: "\n")) {
                let lineData = buffer[buffer.startIndex..<newlineIndex]
                buffer = Data(buffer[buffer.index(after: newlineIndex)...])

                guard !lineData.isEmpty else { continue }

                do {
                    let request = try JSONDecoder().decode(PCRequest.self, from: lineData)
                    await handleRequest(request, vnc: vnc, input: input, scaling: scaling)
                } catch {
                    respond(.error(id: nil, code: -32700, message: "Parse error: \(error.localizedDescription)"))
                }
            }
        }

        log("stdin closed — shutting down")
    }

    // MARK: - Request Handler

    func handleRequest(
        _ req: PCRequest,
        vnc: VNCBridge,
        input: InputController,
        scaling: DisplayScaling
    ) async {
        let id = req.id
        let p = req.params

        do {
            switch req.method {

            // ── Screen ────────────────────────────────────────

            case "screenshot":
                guard let imageData = vnc.withFramebuffer({ buf, w, h -> Data? in
                    createPNGFromRGBA(buffer: buf, width: w, height: h)
                }) ?? nil else {
                    throw VNCError.sendFailed("No framebuffer")
                }
                respond(.success(id: id, image: imageData.base64EncodedString(),
                                  scaledWidth: scaling.scaledWidth, scaledHeight: scaling.scaledHeight))

            case "cursor_crop":
                let pos = input.cursorPosition
                let scaledPos = scaling.toScaled(x: pos.x, y: pos.y)
                guard let imageData = vnc.withFramebuffer({ buf, w, h -> Data? in
                    cropWithCrosshair(buffer: buf, width: w, height: h,
                                      centerX: pos.x, centerY: pos.y, radius: input.timing.cursorCropRadius)
                }) ?? nil else {
                    throw VNCError.sendFailed("No framebuffer")
                }
                respond(.success(id: id, image: imageData.base64EncodedString(),
                                  x: scaledPos.x, y: scaledPos.y))

            case "diff_check":
                let changed = vnc.withFramebuffer { buf, _, _ -> Bool in
                    diffCheck(buffer: buf)
                } ?? false
                respond(.success(id: id, detail: "changeDetected: \(changed)"))

            case "set_baseline":
                vnc.withFramebuffer { buf, _, _ in
                    Self.baselineBuffer = Data(buf)
                }
                respond(.success(id: id, detail: "OK"))

            // ── Mouse ─────────────────────────────────────────

            case "mouse_move":
                let native = nativeXY(p, scaling: scaling)
                try await input.mouseMove(x: native.x, y: native.y)
                respond(.success(id: id, detail: "OK"))

            case "hover":
                let native = nativeXY(p, scaling: scaling)
                try await input.mouseHover(x: native.x, y: native.y)
                respond(.success(id: id, detail: "OK"))

            case "nudge":
                guard let dx = p?.dx, let dy = p?.dy else {
                    throw VNCError.sendFailed("Missing dx/dy")
                }
                let nativeDX = Int((Double(dx) * Double(scaling.nativeWidth) / Double(scaling.scaledWidth)).rounded())
                let nativeDY = Int((Double(dy) * Double(scaling.nativeHeight) / Double(scaling.scaledHeight)).rounded())
                try await input.mouseNudge(dx: nativeDX, dy: nativeDY)
                let pos = scaling.toScaled(x: input.cursorPosition.x, y: input.cursorPosition.y)
                respond(.success(id: id, detail: "OK", x: pos.x, y: pos.y))

            case "mouse_click":
                let native = nativeXY(p, scaling: scaling)
                let btn = parseButton(p?.button)
                try await input.mouseClick(x: native.x, y: native.y, button: btn)
                respond(.success(id: id, detail: "OK"))

            case "mouse_double_click":
                let native = nativeXY(p, scaling: scaling)
                try await input.mouseDoubleClick(x: native.x, y: native.y)
                respond(.success(id: id, detail: "OK"))

            case "mouse_drag":
                guard let toX = p?.toX, let toY = p?.toY else {
                    throw VNCError.sendFailed("Missing toX/toY")
                }
                let from = nativeXY(p, scaling: scaling)
                let to = scaling.toNative(x: toX, y: toY)
                try await input.mouseDrag(fromX: from.x, fromY: from.y, toX: to.x, toY: to.y)
                respond(.success(id: id, detail: "OK"))

            case "scroll":
                let native = nativeXY(p, scaling: scaling)
                guard let dirStr = p?.direction,
                      let dir = ScrollDirection(rawValue: dirStr) else {
                    throw VNCError.sendFailed("Missing direction")
                }
                try await input.scroll(x: native.x, y: native.y, direction: dir, amount: p?.amount ?? 3)
                respond(.success(id: id, detail: "OK"))

            // ── Keyboard ──────────────────────────────────────

            case "key_tap":
                guard let keyName = p?.key, let sym = namedKeyToKeysym(keyName) else {
                    throw VNCError.sendFailed("Missing or unknown key")
                }
                try await input.keyTap(sym)
                respond(.success(id: id, detail: "OK"))

            case "key_combo":
                if let combo = p?.key {
                    try await input.keyCombo(combo)
                } else if let keys = p?.keys {
                    let syms = keys.compactMap { namedKeyToKeysym($0) }
                    guard syms.count == keys.count else {
                        throw VNCError.sendFailed("Unknown key in combo: \(keys)")
                    }
                    try await input.keyCombo(syms)
                } else {
                    throw VNCError.sendFailed("Missing key or keys")
                }
                respond(.success(id: id, detail: "OK"))

            case "key_type":
                guard let text = p?.text else {
                    throw VNCError.sendFailed("Missing text")
                }
                try await input.typeText(text)
                respond(.success(id: id, detail: "OK"))

            case "paste":
                guard let text = p?.text else {
                    throw VNCError.sendFailed("Missing text")
                }
                try await input.pasteText(text)
                respond(.success(id: id, detail: "OK"))

            // ── Detection ──────────────────────────────────────

            case "detect_elements":
                let elements = vnc.withFramebuffer { buf, w, h -> [TextElement] in
                    detectTextElements(buffer: buf, width: w, height: h, scaling: scaling)
                } ?? []
                respond(.success(id: id, detail: "\(elements.count) elements",
                                  scaledWidth: scaling.scaledWidth, scaledHeight: scaling.scaledHeight,
                                  elements: elements))

            // ── Configuration ─────────────────────────────────

            case "configure":
                handleConfigure(id: id, params: p, input: input, scaling: scaling)

            case "get_timing":
                let timing = buildTimingMap(input: input, scaling: scaling)
                respond(.success(id: id,
                                  scaledWidth: scaling.scaledWidth, scaledHeight: scaling.scaledHeight,
                                  timing: timing))

            // ── Control ───────────────────────────────────────

            case "wait":
                let ms = p?.ms ?? 500
                try await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
                respond(.success(id: id, detail: "OK"))

            case "health":
                respond(.success(id: id, detail: "\(vnc.connectionState)",
                                  scaledWidth: scaling.scaledWidth, scaledHeight: scaling.scaledHeight))

            case "shutdown":
                respond(.success(id: id, detail: "OK"))
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { Foundation.exit(0) }
                return

            default:
                respond(.error(id: id, code: -32601, message: "Method not found: \(req.method)"))
            }
        } catch {
            respond(.error(id: id, message: error.localizedDescription))
        }
    }

    // MARK: - Configure Handler

    private func handleConfigure(
        id: PCId?,
        params p: PCRequest.Params?,
        input: InputController,
        scaling: DisplayScaling
    ) {
        if p?.reset == true {
            input.timing = InputTiming()
            let timing = buildTimingMap(input: input, scaling: scaling)
            respond(.success(id: id, detail: "OK — reset to defaults",
                              scaledWidth: scaling.scaledWidth, scaledHeight: scaling.scaledHeight,
                              timing: timing))
            return
        }

        var changed: [String] = []

        // Display
        if let v = p?.maxDimension {
            scaling.reconfigure(maxDimension: v)
            Self.maxImageDimension = v
            changed.append("max_dimension")
        }

        // Mouse
        if let v = p?.clickHoldMs {
            input.timing.clickHoldUs = UInt32(v) * 1000
            changed.append("click_hold_ms")
        }
        if let v = p?.doubleClickGapMs {
            input.timing.doubleClickGapUs = UInt32(v) * 1000
            changed.append("double_click_gap_ms")
        }
        if let v = p?.hoverSettleMs {
            input.timing.hoverSettleUs = UInt32(v) * 1000
            changed.append("hover_settle_ms")
        }

        // Drag
        if let v = p?.dragPositionMs {
            input.timing.dragPositionUs = UInt32(v) * 1000
            changed.append("drag_position_ms")
        }
        if let v = p?.dragPressMs {
            input.timing.dragPressUs = UInt32(v) * 1000
            changed.append("drag_press_ms")
        }
        if let v = p?.dragStepMs {
            input.timing.dragStepUs = UInt32(v) * 1000
            changed.append("drag_step_ms")
        }
        if let v = p?.dragSettleMs {
            input.timing.dragSettleUs = UInt32(v) * 1000
            changed.append("drag_settle_ms")
        }
        if let v = p?.dragPixelsPerStep {
            input.timing.dragPixelsPerStep = v
            changed.append("drag_pixels_per_step")
        }
        if let v = p?.dragMinSteps {
            input.timing.dragMinSteps = v
            changed.append("drag_min_steps")
        }

        // Scroll
        if let v = p?.scrollPressMs {
            input.timing.scrollPressUs = UInt32(v) * 1000
            changed.append("scroll_press_ms")
        }
        if let v = p?.scrollTickMs {
            input.timing.scrollTickUs = UInt32(v) * 1000
            changed.append("scroll_tick_ms")
        }

        // Keyboard
        if let v = p?.keyHoldMs {
            input.timing.keyHoldUs = UInt32(v) * 1000
            changed.append("key_hold_ms")
        }
        if let v = p?.comboModMs {
            input.timing.comboModUs = UInt32(v) * 1000
            changed.append("combo_mod_ms")
        }

        // Typing
        if let v = p?.typeKeyMs {
            input.timing.typeKeyUs = UInt32(v) * 1000
            changed.append("type_key_ms")
        }
        if let v = p?.typeInterKeyMs {
            input.timing.typeInterKeyUs = UInt32(v) * 1000
            changed.append("type_inter_key_ms")
        }
        if let v = p?.typeShiftMs {
            input.timing.typeShiftUs = UInt32(v) * 1000
            changed.append("type_shift_ms")
        }
        if let v = p?.pasteSettleMs {
            input.timing.pasteSettleUs = UInt32(v) * 1000
            changed.append("paste_settle_ms")
        }

        // Display tuning
        if let v = p?.cursorCropRadius {
            input.timing.cursorCropRadius = v
            changed.append("cursor_crop_radius")
        }

        if changed.isEmpty {
            respond(.error(id: id, message: "No valid parameters provided"))
            return
        }

        log("configure: \(changed.joined(separator: ", "))")

        if changed.contains("max_dimension") {
            log("Display rescaled: \(scaling.scaledWidth)×\(scaling.scaledHeight)")
            respond(.success(id: id, detail: "OK — changed: \(changed.joined(separator: ", "))",
                              scaledWidth: scaling.scaledWidth, scaledHeight: scaling.scaledHeight))
        } else {
            respond(.success(id: id, detail: "OK — changed: \(changed.joined(separator: ", "))"))
        }
    }

    // MARK: - Timing Map Builder

    private func buildTimingMap(input: InputController, scaling: DisplayScaling) -> [String: Double] {
        let t = input.timing
        return [
            "max_dimension": Double(scaling.maxDimension),
            "click_hold_ms": Double(t.clickHoldUs) / 1000,
            "double_click_gap_ms": Double(t.doubleClickGapUs) / 1000,
            "hover_settle_ms": Double(t.hoverSettleUs) / 1000,
            "drag_position_ms": Double(t.dragPositionUs) / 1000,
            "drag_press_ms": Double(t.dragPressUs) / 1000,
            "drag_step_ms": Double(t.dragStepUs) / 1000,
            "drag_settle_ms": Double(t.dragSettleUs) / 1000,
            "drag_pixels_per_step": t.dragPixelsPerStep,
            "drag_min_steps": Double(t.dragMinSteps),
            "scroll_press_ms": Double(t.scrollPressUs) / 1000,
            "scroll_tick_ms": Double(t.scrollTickUs) / 1000,
            "key_hold_ms": Double(t.keyHoldUs) / 1000,
            "combo_mod_ms": Double(t.comboModUs) / 1000,
            "type_key_ms": Double(t.typeKeyUs) / 1000,
            "type_inter_key_ms": Double(t.typeInterKeyUs) / 1000,
            "type_shift_ms": Double(t.typeShiftUs) / 1000,
            "paste_settle_ms": Double(t.pasteSettleUs) / 1000,
            "cursor_crop_radius": Double(t.cursorCropRadius),
        ]
    }

    // MARK: - Helpers

    func nativeXY(_ params: PCRequest.Params?, scaling: DisplayScaling) -> (x: Int, y: Int) {
        let x = params?.x ?? 0
        let y = params?.y ?? 0
        return scaling.toNative(x: x, y: y)
    }

    func parseButton(_ name: String?) -> MouseButton {
        switch name?.lowercased() {
        case "right":  return .right
        case "middle": return .middle
        default:       return .left
        }
    }
}
