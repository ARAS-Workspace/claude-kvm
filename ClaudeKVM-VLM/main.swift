import Foundation
import ArgumentParser
import CoreGraphics
import AppKit

@main
struct ClaudeKVMVLM: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "claude-kvm-vlm",
        abstract: "VLM-powered VNC operator daemon for Claude KVM (Apple Silicon)",
        discussion: """
             █████╗ ██████╗  █████╗ ███████╗
            ██╔══██╗██╔══██╗██╔══██╗██╔════╝
            ███████║██████╔╝███████║███████╗
            ██╔══██║██╔══██╗██╔══██║╚════██║
            ██║  ██║██║  ██║██║  ██║███████║
            ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝

            Copyright (c) 2025 Riza Emre ARAS <r.emrearas@proton.me>
            Released under the MIT License - see LICENSE for details.

            Long-running daemon that connects to a VNC server and operates it
            using a local Vision Language Model. Reads JSON commands from stdin,
            writes JSON events to stdout.

            MODES:
              Daemon         Default. Connects to VNC, loads VLM, listens on stdin.
              Download Model Run with --download-model to download the VLM model.

            EXAMPLES:
              Download model:
                claude-kvm-vlm --download-model

              Start daemon:
                claude-kvm-vlm --host 192.168.1.100 --port 5900 --password secret

              Multiple instances:
                claude-kvm-vlm --host 10.0.0.1 --port 5900 &
                claude-kvm-vlm --host 10.0.0.2 --port 5900 &

            PROTOCOL (stdin/stdout NDJSON):
              stdin  {"id":"c1","type":"prompt","payload":"Click Safari icon"}
              stdout {"id":"c1","type":"status","state":"finding"}
              stdout {"id":"c1","type":"result","success":true,"detail":"Safari opened"}

            OUTPUT:
              stdout  NDJSON event stream (daemon) or status lines (download).
              stderr  Verbose logs (-v), errors ([ERROR] prefix).
              exit 0  Clean shutdown.
              exit 1  Failure.
            """
    )

    // MARK: - VNC Options

    @Option(name: .long, help: "VNC server hostname or IP address.")
    var host: String = "127.0.0.1"

    @Option(name: .long, help: "VNC server port.")
    var port: Int = 5900

    @Option(name: .long, help: "VNC username (required for macOS ARD auth).")
    var username: String?

    @Option(name: .long, help: "VNC server password.")
    var password: String?

    // MARK: - Mode Options

    @Flag(name: .long, help: "Download the VLM model and exit.")
    var downloadModel: Bool = false

    @Flag(name: [.short, .long], help: "Enable verbose logging to stderr.")
    var verbose: Bool = false

    // MARK: - Run

    func run() async throws {
        if downloadModel {
            try await runDownloadModel()
            return
        }

        try await runDaemon()
    }

    // MARK: - Download Model Mode

    private func runDownloadModel() async throws {
        let engine = VLMEngine()
        engine.verbose = verbose
        engine.log("Download mode: ensuring model is ready")
        engine.log("Model: \(VLMEngine.modelId)")

        do {
            try await engine.ensureModel()
        } catch {
            printError("Model download failed: \(error.localizedDescription)")
            throw ExitCode.failure
        }

        let cachePath = engine.modelCachePath ?? "unknown"
        print("[READY] \(VLMEngine.modelId)")
        print("[CACHE] \(cachePath)")
    }

    // MARK: - Daemon Mode

    private func runDaemon() async throws {
        log("Starting daemon — VNC \(host):\(port)")

        // 1. Check model is cached
        let engine = VLMEngine()
        engine.verbose = verbose

        guard engine.isModelCached else {
            printError(
                "Model not downloaded. Run: claude-kvm-vlm --download-model"
            )
            throw ExitCode.failure
        }

        // 2. Load VLM model
        log("Loading VLM model...")
        do {
            try await engine.ensureModel()
        } catch {
            printError("Failed to load model: \(error.localizedDescription)")
            throw ExitCode.failure
        }
        log("VLM model ready")

        // 3. Connect VNC
        let vncConfig = VNCConfiguration(
            host: host,
            port: port,
            username: username,
            password: password
        )
        let vnc = VNCBridge(config: vncConfig)
        vnc.verbose = verbose

        vnc.onStateChange = { state in
            self.emitEvent(Event(type: "vnc_state", detail: "\(state)"))
        }

        vnc.onFrameComplete = {
            // Future: trigger VLM analysis pipeline
        }

        do {
            try await vnc.connect()
        } catch {
            printError("VNC connection failed: \(error.localizedDescription)")
            throw ExitCode.failure
        }

        // 4. Initialize display scaling
        let scaling = DisplayScaling(
            nativeWidth: vnc.framebufferWidth,
            nativeHeight: vnc.framebufferHeight
        )
        log("Display: \(scaling.nativeWidth)×\(scaling.nativeHeight) → \(scaling.scaledWidth)×\(scaling.scaledHeight)")

        emitEvent(Event(
            type: "ready",
            detail: "VNC connected, VLM loaded",
            scaledWidth: scaling.scaledWidth,
            scaledHeight: scaling.scaledHeight
        ))

        // 5. Create input controller
        let input = InputController(vnc: vnc)

        // 6. Enter command loop (stdin NDJSON)
        await runCommandLoop(vnc: vnc, engine: engine, input: input, scaling: scaling)

        // 6. Cleanup
        vnc.disconnect()
        log("Daemon stopped")
    }

    // MARK: - Command Loop

    // Baseline buffer for diff_check
    private static var baselineBuffer: Data?
    private static let diffThreshold: UInt8 = 30

    private func runCommandLoop(vnc: VNCBridge, engine: VLMEngine, input: InputController, scaling: DisplayScaling) async {
        let stdin = FileHandle.standardInput

        // Watch for stdin EOF (parent process closed pipe)
        let stdinStream = AsyncStream<Data> { continuation in
            DispatchQueue.global(qos: .userInteractive).async {
                while true {
                    let data = stdin.availableData
                    if data.isEmpty {
                        // EOF — parent closed stdin
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

            // Process complete lines (NDJSON — one JSON object per line)
            while let newlineIndex = buffer.firstIndex(of: UInt8(ascii: "\n")) {
                let lineData = buffer[buffer.startIndex..<newlineIndex]
                buffer = Data(buffer[buffer.index(after: newlineIndex)...])

                guard !lineData.isEmpty else { continue }

                do {
                    let command = try JSONDecoder().decode(Command.self, from: lineData)
                    await handleCommand(command, vnc: vnc, engine: engine, input: input, scaling: scaling)
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

    private func handleCommand(
        _ command: Command,
        vnc: VNCBridge,
        engine: VLMEngine,
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
                vnc.withFramebuffer { buf, _, _ -> Void in
                    Self.baselineBuffer = Data(buf)
                }
                emitEvent(Event(id: id, type: "result", success: true, detail: "OK"))

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
                // Scale the delta too
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

            // ── VLM ───────────────────────────────────────────

            case "vlm_prompt":
                await handleVLMPrompt(command, vnc: vnc, engine: engine, scaling: scaling)
                return

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

    // MARK: - Coordinate Helpers

    private func nativeXY(_ command: Command, scaling: DisplayScaling) -> (x: Int, y: Int) {
        let x = command.x ?? 0
        let y = command.y ?? 0
        return scaling.toNative(x: x, y: y)
    }

    private func parseButton(_ name: String?) -> MouseButton {
        switch name?.lowercased() {
        case "right":  return .right
        case "middle": return .middle
        default:       return .left
        }
    }

    // MARK: - VLM Prompt Handler

    private func handleVLMPrompt(
        _ command: Command,
        vnc: VNCBridge,
        engine: VLMEngine,
        scaling: DisplayScaling
    ) async {
        guard let payload = command.payload, !payload.isEmpty else {
            emitEvent(Event(id: command.id, type: "error", detail: "Missing payload"))
            return
        }

        emitEvent(Event(id: command.id, type: "status", state: "processing"))

        // If crop region specified, crop that area; otherwise full screen
        let imageData: Data?
        if let sx = command.x, let sy = command.y,
           let sw = command.width, let sh = command.height {
            let native = scaling.toNative(x: sx, y: sy)
            let nw = Int((Double(sw) * Double(scaling.nativeWidth) / Double(scaling.scaledWidth)).rounded())
            let nh = Int((Double(sh) * Double(scaling.nativeHeight) / Double(scaling.scaledHeight)).rounded())
            imageData = vnc.withFramebuffer { buf, w, h -> Data? in
                cropRegionToPNG(buffer: buf, fbWidth: w, fbHeight: h,
                                x: native.x, y: native.y, width: nw, height: nh)
            } ?? nil
        } else {
            imageData = vnc.withFramebuffer { buf, w, h -> Data? in
                createPNGFromRGBA(buffer: buf, width: w, height: h)
            } ?? nil
        }

        guard let imageData else {
            emitEvent(Event(id: command.id, type: "error", detail: "No framebuffer available"))
            return
        }

        do {
            let result = try await engine.generate(imageData: imageData, prompt: payload, maxTokens: 1024)
            emitEvent(Event(id: command.id, type: "result", success: true, detail: result))
        } catch {
            emitEvent(Event(id: command.id, type: "error", detail: "VLM failed: \(error.localizedDescription)"))
        }
    }

    // MARK: - Screenshot Handler (kept for internal use)

    private func handleScreenshot(_ command: Command, vnc: VNCBridge, scaling: DisplayScaling) {
        guard let imageData = vnc.withFramebuffer({ buf, w, h -> Data? in
            createPNGFromRGBA(buffer: buf, width: w, height: h)
        }) ?? nil else {
            emitEvent(Event(id: command.id, type: "error", detail: "No framebuffer"))
            return
        }
        emitEvent(Event(
            id: command.id, type: "result", success: true,
            image: imageData.base64EncodedString(),
            scaledWidth: scaling.scaledWidth,
            scaledHeight: scaling.scaledHeight
        ))
    }

    // MARK: - Diff Check

    private func diffCheck(buffer: UnsafeRawBufferPointer) -> Bool {
        guard let baseline = Self.baselineBuffer else {
            Self.baselineBuffer = Data(buffer)
            return false
        }

        let threshold = Self.diffThreshold
        let count = min(baseline.count, buffer.count)

        var changed = false
        baseline.withUnsafeBytes { basePtr in
            let base = basePtr.bindMemory(to: UInt8.self)
            let current = buffer.bindMemory(to: UInt8.self)
            for i in stride(from: 0, to: count, by: 4) {
                if abs(Int(base[i]) - Int(current[i])) > Int(threshold) ||
                   abs(Int(base[i+1]) - Int(current[i+1])) > Int(threshold) ||
                   abs(Int(base[i+2]) - Int(current[i+2])) > Int(threshold) {
                    changed = true
                    return
                }
            }
        }

        Self.baselineBuffer = Data(buffer)
        return changed
    }

    // MARK: - Cursor Crop with Crosshair

    private func cropWithCrosshair(
        buffer: UnsafeRawBufferPointer,
        width: Int, height: Int,
        centerX: Int, centerY: Int, radius: Int
    ) -> Data? {
        let left = max(0, centerX - radius)
        let top = max(0, centerY - radius)
        let right = min(width, centerX + radius)
        let bottom = min(height, centerY + radius)
        let cropW = right - left
        let cropH = bottom - top
        guard cropW > 0, cropH > 0 else { return nil }

        // Extract crop region
        var cropData = [UInt8](repeating: 0, count: cropW * cropH * 4)
        let src = buffer.bindMemory(to: UInt8.self)
        for row in 0..<cropH {
            let srcOffset = ((top + row) * width + left) * 4
            let dstOffset = row * cropW * 4
            let rowBytes = cropW * 4
            for col in 0..<rowBytes {
                cropData[dstOffset + col] = src[srcOffset + col]
            }
        }

        // Draw red crosshair
        let cx = centerX - left
        let cy = centerY - top
        let crossSize = 12
        for i in -crossSize...crossSize {
            // Horizontal
            let hx = cx + i
            if hx >= 0, hx < cropW {
                let off = (cy * cropW + hx) * 4
                cropData[off] = 255; cropData[off+1] = 0; cropData[off+2] = 0; cropData[off+3] = 255
            }
            // Vertical
            let vy = cy + i
            if vy >= 0, vy < cropH {
                let off = (vy * cropW + cx) * 4
                cropData[off] = 255; cropData[off+1] = 0; cropData[off+2] = 0; cropData[off+3] = 255
            }
        }

        // Encode to PNG
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return cropData.withUnsafeMutableBytes { rawPtr -> Data? in
            guard let ctx = CGContext(
                data: rawPtr.baseAddress,
                width: cropW, height: cropH,
                bitsPerComponent: 8, bytesPerRow: cropW * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ), let cgImage = ctx.makeImage() else { return nil }
            let rep = NSBitmapImageRep(cgImage: cgImage)
            return rep.representation(using: .png, properties: [:])
        }
    }

    // MARK: - Crop Region to PNG

    private func cropRegionToPNG(
        buffer: UnsafeRawBufferPointer,
        fbWidth: Int, fbHeight: Int,
        x: Int, y: Int, width cropW: Int, height cropH: Int
    ) -> Data? {
        let clampedX = max(0, min(x, fbWidth))
        let clampedY = max(0, min(y, fbHeight))
        let clampedW = min(cropW, fbWidth - clampedX)
        let clampedH = min(cropH, fbHeight - clampedY)
        guard clampedW > 0, clampedH > 0 else { return nil }

        var cropData = [UInt8](repeating: 0, count: clampedW * clampedH * 4)
        let src = buffer.bindMemory(to: UInt8.self)
        for row in 0..<clampedH {
            let srcOffset = ((clampedY + row) * fbWidth + clampedX) * 4
            let dstOffset = row * clampedW * 4
            let rowBytes = clampedW * 4
            for col in 0..<rowBytes {
                cropData[dstOffset + col] = src[srcOffset + col]
            }
        }

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return cropData.withUnsafeMutableBytes { rawPtr -> Data? in
            guard let ctx = CGContext(
                data: rawPtr.baseAddress,
                width: clampedW, height: clampedH,
                bitsPerComponent: 8, bytesPerRow: clampedW * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ), let cgImage = ctx.makeImage() else { return nil }
            let rep = NSBitmapImageRep(cgImage: cgImage)
            return rep.representation(using: .png, properties: [:])
        }
    }

    // MARK: - PNG Encoding

    private static let maxImageDimension = 1280

    private func createPNGFromRGBA(
        buffer: UnsafeRawBufferPointer,
        width: Int,
        height: Int
    ) -> Data? {
        guard let baseAddress = buffer.baseAddress else { return nil }
        let bytesPerRow = width * 4

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                  data: UnsafeMutableRawPointer(mutating: baseAddress),
                  width: width,
                  height: height,
                  bitsPerComponent: 8,
                  bytesPerRow: bytesPerRow,
                  space: colorSpace,
                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
              ),
              let cgImage = context.makeImage() else {
            return nil
        }

        // Scale down if larger than maxImageDimension
        let maxDim = Self.maxImageDimension
        let finalImage: CGImage
        if width > maxDim || height > maxDim {
            let scale = Double(maxDim) / Double(max(width, height))
            let newW = Int(Double(width) * scale)
            let newH = Int(Double(height) * scale)

            guard let scaleCtx = CGContext(
                data: nil,
                width: newW,
                height: newH,
                bitsPerComponent: 8,
                bytesPerRow: newW * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ) else { return nil }

            scaleCtx.interpolationQuality = .high
            scaleCtx.draw(cgImage, in: CGRect(x: 0, y: 0, width: newW, height: newH))

            guard let scaled = scaleCtx.makeImage() else { return nil }
            finalImage = scaled
        } else {
            finalImage = cgImage
        }

        let rep = NSBitmapImageRep(cgImage: finalImage)
        return rep.representation(using: .png, properties: [:])
    }

    // MARK: - Event Emission (stdout NDJSON)

    private func emitEvent(_ event: Event) {
        guard let data = try? JSONEncoder().encode(event),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        print(json)
        fflush(stdout)
    }

    // MARK: - Logging

    private func log(_ message: String) {
        guard verbose else { return }
        let ts = timestamp()
        FileHandle.standardError.write(Data("[DAEMON \(ts)] \(message)\n".utf8))
    }

    private func printError(_ message: String) {
        FileHandle.standardError.write(Data("[ERROR] \(message)\n".utf8))
    }

    private func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }
}

// MARK: - Protocol Types

struct Command: Decodable {
    let id: String?
    let type: String
    let payload: String?
    let x: Int?
    let y: Int?
    let toX: Int?
    let toY: Int?
    let dx: Int?
    let dy: Int?
    let width: Int?
    let height: Int?
    let button: String?
    let key: String?
    let keys: [String]?
    let text: String?
    let direction: String?
    let amount: Int?
    let ms: Int?
}

struct Event: Encodable {
    var id: String?
    var type: String
    var success: Bool?
    var state: String?
    var detail: String?
    var image: String?
    var x: Int?
    var y: Int?
    var scaledWidth: Int?
    var scaledHeight: Int?
}

// MARK: - Display Scaling

struct DisplayScaling {
    let nativeWidth: Int
    let nativeHeight: Int
    let scaledWidth: Int
    let scaledHeight: Int

    init(nativeWidth: Int, nativeHeight: Int, maxDimension: Int = 1280) {
        self.nativeWidth = nativeWidth
        self.nativeHeight = nativeHeight
        let ratio = min(
            Double(maxDimension) / Double(nativeWidth),
            Double(maxDimension) / Double(nativeHeight),
            1.0
        )
        self.scaledWidth = Int((Double(nativeWidth) * ratio).rounded())
        self.scaledHeight = Int((Double(nativeHeight) * ratio).rounded())
    }

    func toNative(x: Int, y: Int) -> (x: Int, y: Int) {
        let sx = Double(nativeWidth) / Double(scaledWidth)
        let sy = Double(nativeHeight) / Double(scaledHeight)
        return (x: Int((Double(x) * sx).rounded()), y: Int((Double(y) * sy).rounded()))
    }

    func toScaled(x: Int, y: Int) -> (x: Int, y: Int) {
        let sx = Double(scaledWidth) / Double(nativeWidth)
        let sy = Double(scaledHeight) / Double(nativeHeight)
        return (x: Int((Double(x) * sx).rounded()), y: Int((Double(y) * sy).rounded()))
    }
}
