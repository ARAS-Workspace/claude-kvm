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
                    let command = try JSONDecoder().decode(Command.self, from: lineData)
                    await handleCommand(command, vnc: vnc, input: input, scaling: scaling)
                } catch {
                    emitEvent(Event(
                        type: "error",
                        detail: "Invalid command: \(error.localizedDescription)"
                    ))
                }
            }
        }

        log("stdin closed — shutting down")
    }

    // MARK: - Command Handler

    func handleCommand(
        _ command: Command,
        vnc: VNCBridge,
        input: InputController,
        scaling: DisplayScaling
    ) async {
        let id = command.id

        do {
            switch command.type {

            // ── Screen ────────────────────────────────────────

            case "screenshot":
                guard let imageData = vnc.withFramebuffer({ buf, w, h -> Data? in
                    createPNGFromRGBA(buffer: buf, width: w, height: h)
                }) ?? nil else {
                    throw VNCError.sendFailed("No framebuffer")
                }
                emitEvent(Event(
                    id: id, type: "result", success: true,
                    image: imageData.base64EncodedString(),
                    scaledWidth: scaling.scaledWidth,
                    scaledHeight: scaling.scaledHeight
                ))

            case "cursor_crop":
                let pos = input.cursorPosition
                let scaledPos = scaling.toScaled(x: pos.x, y: pos.y)
                guard let imageData = vnc.withFramebuffer({ buf, w, h -> Data? in
                    cropWithCrosshair(
                        buffer: buf, width: w, height: h,
                        centerX: pos.x, centerY: pos.y, radius: 150
                    )
                }) ?? nil else {
                    throw VNCError.sendFailed("No framebuffer")
                }
                emitEvent(Event(
                    id: id, type: "result", success: true,
                    image: imageData.base64EncodedString(),
                    x: scaledPos.x, y: scaledPos.y
                ))

            case "diff_check":
                let changed = vnc.withFramebuffer { buf, _, _ -> Bool in
                    diffCheck(buffer: buf)
                } ?? false
                emitEvent(Event(id: id, type: "result", success: true, detail: "changeDetected: \(changed)"))

            case "set_baseline":
                vnc.withFramebuffer { buf, _, _ in
                    Self.baselineBuffer = Data(buf)
                }
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            // ── Cursor ────────────────────────────────────────

            case "cursor_pos":
                let pos = scaling.toScaled(x: vnc.serverCursorX, y: vnc.serverCursorY)
                emitEvent(Event(id: id, type: "result", success: true, x: pos.x, y: pos.y))

            // ── Mouse ─────────────────────────────────────────

            case "mouse_move":
                let native = nativeXY(command, scaling: scaling)
                try await input.mouseMove(x: native.x, y: native.y)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "hover":
                let native = nativeXY(command, scaling: scaling)
                try await input.mouseHover(x: native.x, y: native.y)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "nudge":
                guard let dx = command.dx, let dy = command.dy else {
                    throw VNCError.sendFailed("Missing dx/dy")
                }
                let nativeDX = Int((Double(dx) * Double(scaling.nativeWidth) / Double(scaling.scaledWidth)).rounded())
                let nativeDY = Int((Double(dy) * Double(scaling.nativeHeight) / Double(scaling.scaledHeight)).rounded())
                try await input.mouseNudge(dx: nativeDX, dy: nativeDY)
                let pos = scaling.toScaled(x: input.cursorPosition.x, y: input.cursorPosition.y)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK", x: pos.x, y: pos.y))

            case "mouse_click":
                let native = nativeXY(command, scaling: scaling)
                let btn = parseButton(command.button)
                try await input.mouseClick(x: native.x, y: native.y, button: btn)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "mouse_double_click":
                let native = nativeXY(command, scaling: scaling)
                try await input.mouseDoubleClick(x: native.x, y: native.y)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "mouse_drag":
                guard let toX = command.toX, let toY = command.toY else {
                    throw VNCError.sendFailed("Missing toX/toY")
                }
                let from = nativeXY(command, scaling: scaling)
                let to = scaling.toNative(x: toX, y: toY)
                try await input.mouseDrag(fromX: from.x, fromY: from.y, toX: to.x, toY: to.y)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "scroll":
                let native = nativeXY(command, scaling: scaling)
                guard let dirStr = command.direction,
                      let dir = ScrollDirection(rawValue: dirStr) else {
                    throw VNCError.sendFailed("Missing direction")
                }
                try await input.scroll(x: native.x, y: native.y, direction: dir, amount: command.amount ?? 3)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            // ── Keyboard ──────────────────────────────────────

            case "key_tap":
                guard let keyName = command.key, let sym = namedKeyToKeysym(keyName) else {
                    throw VNCError.sendFailed("Missing or unknown key")
                }
                try await input.keyTap(sym)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "key_combo":
                if let combo = command.key {
                    try await input.keyCombo(combo)
                } else if let keys = command.keys {
                    let syms = keys.compactMap { namedKeyToKeysym($0) }
                    guard syms.count == keys.count else {
                        throw VNCError.sendFailed("Unknown key in combo: \(keys)")
                    }
                    try await input.keyCombo(syms)
                } else {
                    throw VNCError.sendFailed("Missing key or keys")
                }
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "key_type":
                guard let text = command.text else {
                    throw VNCError.sendFailed("Missing text")
                }
                try await input.typeText(text)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "paste":
                guard let text = command.text else {
                    throw VNCError.sendFailed("Missing text")
                }
                try await input.pasteText(text)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            // ── Control ───────────────────────────────────────

            case "wait":
                let ms = command.ms ?? 500
                try await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

            case "health":
                emitEvent(Event(
                    id: id, type: "result", success: true,
                    detail: "\(vnc.connectionState)",
                    scaledWidth: scaling.scaledWidth,
                    scaledHeight: scaling.scaledHeight
                ))

            case "shutdown":
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { Foundation.exit(0) }
                return

            default:
                emitEvent(Event(id: id, type: "error", detail: "Unknown command: \(command.type)"))
            }
        } catch {
            emitEvent(Event(id: id, type: "error", detail: "\(error.localizedDescription)"))
        }
    }

    // MARK: - Helpers

    func nativeXY(_ command: Command, scaling: DisplayScaling) -> (x: Int, y: Int) {
        let x = command.x ?? 0
        let y = command.y ?? 0
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
