import Foundation
import ArgumentParser

@main
struct ClaudeKVMDaemon: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "claude-kvm-daemon",
        abstract: "Native VNC client daemon for Claude KVM (Apple Silicon)",
        discussion: """
             █████╗ ██████╗  █████╗ ███████╗
            ██╔══██╗██╔══██╗██╔══██╗██╔════╝
            ███████║██████╔╝███████║███████╗
            ██╔══██║██╔══██╗██╔══██║╚════██║
            ██║  ██║██║  ██║██║  ██║███████║
            ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝

            Copyright (c) 2025 Riza Emre ARAS <r.emrearas@proton.me>
            Released under the MIT License - see LICENSE for details.

            Long-running VNC client daemon. Reads JSON commands from stdin,
            writes JSON events to stdout. Designed to be spawned by the
            claude-kvm MCP proxy (JS) for Claude-driven desktop control.

            EXAMPLES:
              claude-kvm-daemon --host 192.168.1.100 --port 5900 --password secret
              claude-kvm-daemon --host 10.0.0.1 --port 5900 --macos &

            PROTOCOL (stdin/stdout NDJSON):
              stdin  {"id":"c1","type":"mouse_click","x":640,"y":480}
              stdout {"id":"c1","type":"result","success":true,"detail":"OK"}

            OUTPUT:
              stdout  NDJSON event stream.
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

    // MARK: - Display Options

    @Option(name: .long, help: "Max screenshot dimension in pixels (default: 1280).")
    var maxDimension: Int = 1280

    @Flag(name: .long, help: "Force macOS Apple VNC key remapping (auto-detected if not set).")
    var macos: Bool = false

    @Option(name: .long, help: "VNC connect timeout in seconds.")
    var connectTimeout: Int?

    @Flag(name: [.short, .long], help: "Enable verbose logging to stderr.")
    var verbose: Bool = false

    // MARK: - Run

    func run() async throws {
        try await runDaemon()
    }

    // MARK: - Daemon

    private func runDaemon() async throws {
        log("Starting daemon — VNC \(host):\(port)")

        var vncConfig = VNCConfiguration(
            host: host,
            port: port,
            username: username,
            password: password
        )
        if let timeout = connectTimeout {
            vncConfig.connectTimeout = timeout
        }

        let vnc = VNCBridge(config: vncConfig)
        vnc.verbose = verbose

        vnc.onStateChange = { state in
            self.emitEvent(Event(type: "vnc_state", detail: "\(state)"))
        }

        do {
            try await vnc.connect()
        } catch {
            printError("VNC connection failed: \(error.localizedDescription)")
            throw ExitCode.failure
        }

        if macos {
            vnc.isMacOS = true
            log("macOS mode forced via --macos flag")
        }
        log("macOS mode: \(vnc.isMacOS)")

        Self.maxImageDimension = maxDimension
        let scaling = DisplayScaling(
            nativeWidth: vnc.framebufferWidth,
            nativeHeight: vnc.framebufferHeight,
            maxDimension: maxDimension
        )
        log("Display: \(scaling.nativeWidth)×\(scaling.nativeHeight) → \(scaling.scaledWidth)×\(scaling.scaledHeight)")

        emitEvent(Event(
            type: "ready",
            detail: "VNC connected",
            scaledWidth: scaling.scaledWidth,
            scaledHeight: scaling.scaledHeight
        ))

        // Observer stream — always-on, emits cursor/frame/clipboard events
        let observer = ObserverStream(scaling: scaling) { [self] event in
            emitEvent(event)
        }

        vnc.onCursorPos = { x, y in
            observer.cursorMoved(x: x, y: y)
        }

        vnc.onFrameComplete = {
            observer.frameChanged()
        }

        vnc.onClipboardText = { text in
            observer.clipboardReceived(text)
        }

        let input = InputController(vnc: vnc)

        await runCommandLoop(vnc: vnc, input: input, scaling: scaling)

        vnc.disconnect()
        log("Daemon stopped")
    }

    // MARK: - Event Emission

    func emitEvent(_ event: Event) {
        guard let data = try? JSONEncoder().encode(event),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        print(json)
        fflush(stdout)
    }

    // MARK: - Logging

    func log(_ message: String) {
        guard verbose else { return }
        let ts = timestamp()
        FileHandle.standardError.write(Data("[DAEMON \(ts)] \(message)\n".utf8))
    }

    func printError(_ message: String) {
        FileHandle.standardError.write(Data("[ERROR] \(message)\n".utf8))
    }

    private func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }
}
