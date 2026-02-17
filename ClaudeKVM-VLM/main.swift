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

        emitEvent(Event(
            type: "ready",
            detail: "VNC connected, VLM loaded"
        ))

        // 4. Enter command loop (stdin NDJSON)
        await runCommandLoop(vnc: vnc, engine: engine)

        // 5. Cleanup
        vnc.disconnect()
        log("Daemon stopped")
    }

    // MARK: - Command Loop

    private func runCommandLoop(vnc: VNCBridge, engine: VLMEngine) async {
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
                    await handleCommand(command, vnc: vnc, engine: engine)
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
        engine: VLMEngine
    ) async {
        switch command.type {
        case "prompt":
            await handlePrompt(command, vnc: vnc, engine: engine)

        case "screenshot":
            handleScreenshot(command, vnc: vnc)

        case "shutdown":
            emitEvent(Event(id: command.id, type: "result", success: true, detail: "Shutting down"))
            // Force exit after response is flushed
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                Foundation.exit(0)
            }

        case "health":
            emitEvent(Event(
                id: command.id,
                type: "result",
                success: true,
                detail: "\(vnc.connectionState)"
            ))

        default:
            emitEvent(Event(
                id: command.id,
                type: "error",
                detail: "Unknown command type: \(command.type)"
            ))
        }
    }

    // MARK: - Prompt Handler

    private func handlePrompt(
        _ command: Command,
        vnc: VNCBridge,
        engine: VLMEngine
    ) async {
        guard let payload = command.payload, !payload.isEmpty else {
            emitEvent(Event(id: command.id, type: "error", detail: "Missing payload"))
            return
        }

        emitEvent(Event(id: command.id, type: "status", state: "processing"))

        // Capture framebuffer as PNG for VLM
        guard let imageData = vnc.withFramebuffer({ buffer, width, height -> Data? in
            createPNGFromRGBA(buffer: buffer, width: width, height: height)
        }) ?? nil else {
            emitEvent(Event(id: command.id, type: "error", detail: "No framebuffer available"))
            return
        }

        // Run VLM inference
        do {
            let result = try await engine.generate(
                imageData: imageData,
                prompt: payload,
                maxTokens: 1024
            )
            emitEvent(Event(
                id: command.id,
                type: "result",
                success: true,
                detail: result
            ))
        } catch {
            emitEvent(Event(
                id: command.id,
                type: "error",
                detail: "VLM inference failed: \(error.localizedDescription)"
            ))
        }
    }

    // MARK: - Screenshot Handler

    private func handleScreenshot(_ command: Command, vnc: VNCBridge) {
        guard let imageData = vnc.withFramebuffer({ buffer, width, height -> Data? in
            createPNGFromRGBA(buffer: buffer, width: width, height: height)
        }) ?? nil else {
            emitEvent(Event(id: command.id, type: "error", detail: "No framebuffer available"))
            return
        }

        let base64 = imageData.base64EncodedString()
        emitEvent(Event(
            id: command.id,
            type: "result",
            success: true,
            image: base64
        ))
    }

    // MARK: - PNG Encoding

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

        let rep = NSBitmapImageRep(cgImage: cgImage)
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
}

struct Event: Encodable {
    var id: String?
    var type: String
    var success: Bool?
    var state: String?
    var detail: String?
    var image: String?
}
