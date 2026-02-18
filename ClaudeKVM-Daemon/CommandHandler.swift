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
