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

            Long-running VNC client daemon for AI-driven desktop control.
            Communicates via PC (Procedure Call) over stdin/stdout NDJSON.
            macOS is detected automatically when ARD auth (type 30) is used.

            PROTOCOL:
              Reads PC requests from stdin, writes PC responses to stdout.
              Each line is a single JSON object (NDJSON).

              Request:      {"method":"<name>","params":{...},"id":<int|string>}
              Response:     {"result":{...},"id":<int|string>}
              Error:        {"error":{"code":<int>,"message":"..."},"id":<int|string>}
              Notification: {"method":"<name>","params":{...}}

            METHODS:
              Screen:
                screenshot                              Scaled PNG of full screen
                cursor_crop                             Crop around cursor with crosshair
                diff_check                              Any pixel change since baseline
                set_baseline                            Save current frame for diff comparison

              Mouse:
                mouse_move     {x, y}                   Teleport cursor
                hover          {x, y}                   Move + settle wait
                nudge          {dx, dy}                 Relative cursor move
                mouse_click    {x, y, button?}          Click (left|right|middle)
                mouse_double_click {x, y}               Double click
                mouse_drag     {x, y, toX, toY}         Drag with interpolated path
                scroll         {x, y, direction, amount?} Scroll (up|down|left|right)

              Keyboard:
                key_tap        {key}                    Single key press-release
                key_combo      {key} or {keys:[...]}    Modifier combo (e.g. "cmd+c")
                key_type       {text}                   Type text character by character
                paste          {text}                   Paste via clipboard + combo

              Control:
                wait           {ms?}                    Pause (default 500ms)
                health                                  Connection state + display info
                shutdown                                Graceful exit

            NOTIFICATIONS (server → caller, no id):
              vnc_state      {state}                    Connection state changes
              ready          {scaledWidth, scaledHeight} VNC connected, dimensions

            COORDINATE SYSTEM:
              All coordinates are in scaled display space.
              Native resolution is scaled to fit within --max-dimension.
              Example: 4220×2568 native → 1280×779 scaled (at max 1280)

            macOS DETECTION:
              Automatic via ARD auth type 30 credential request.
              When detected, Meta_L keysyms are remapped to Super_L
              for correct Command key behavior on Apple VNC servers.

            INPUT TIMING (all in milliseconds, all optional with defaults):
              Mouse:
                --click-hold-ms          Click hold duration            (default: 50)
                --double-click-gap-ms    Inter-click gap                (default: 50)
                --hover-settle-ms        Hover settle wait              (default: 400)

              Drag:
                --drag-position-ms       Position settle before press   (default: 30)
                --drag-press-ms          Press hold for drag threshold  (default: 50)
                --drag-step-ms           Between interpolation points   (default: 5)
                --drag-settle-ms         Settle before release          (default: 30)
                --drag-pixels-per-step   Point density in pixels        (default: 20)
                --drag-min-steps         Minimum interpolation steps    (default: 10)

              Scroll:
                --scroll-press-ms        Scroll press-release gap       (default: 10)
                --scroll-tick-ms         Inter-tick delay               (default: 20)

              Keyboard:
                --key-hold-ms            Single key hold duration       (default: 30)
                --combo-mod-ms           Modifier settle delay          (default: 10)

              Typing:
                --type-key-ms            Key hold during typing         (default: 20)
                --type-inter-key-ms      Between characters             (default: 20)
                --type-shift-ms          Shift key settle               (default: 10)
                --paste-settle-ms        After clipboard write          (default: 30)

              Display:
                --cursor-crop-radius     Cursor crop radius in pixels   (default: 150)

            EXAMPLES:
              claude-kvm-daemon --host 192.168.1.100 --port 5900 --password secret
              claude-kvm-daemon --host 10.0.0.1 --port 5900 --username admin --password pass -v
              claude-kvm-daemon --host 10.0.0.1 --port 5900 --password pass --max-dimension 800
              claude-kvm-daemon --host 10.0.0.1 --port 5900 --password pass --click-hold-ms 80 --key-hold-ms 50

            OUTPUT:
              stdout  PC responses and notifications (NDJSON).
              stderr  Verbose logs (-v) and errors ([ERROR] prefix).
              exit 0  Clean shutdown.
              exit 1  Connection failure.
            """
    )

    // MARK: - VNC Connection

    @Option(name: .long, help: "VNC server hostname or IP address.")
    var host: String = "127.0.0.1"

    @Option(name: .long, help: "VNC server port.")
    var port: Int = 5900

    @Option(name: .long, help: "VNC username (required for macOS ARD auth).")
    var username: String?

    @Option(name: .long, help: "VNC server password.")
    var password: String?

    @Option(name: .long, help: "VNC connect timeout in seconds.")
    var connectTimeout: Int?

    // MARK: - Display

    @Option(name: .long, help: "Max screenshot dimension in pixels.")
    var maxDimension: Int = 1280

    // MARK: - Mouse Timing

    @Option(name: .long, help: "Click hold duration in ms.")
    var clickHoldMs: Int?

    @Option(name: .long, help: "Double-click inter-click gap in ms.")
    var doubleClickGapMs: Int?

    @Option(name: .long, help: "Hover settle wait in ms.")
    var hoverSettleMs: Int?

    // MARK: - Drag Timing

    @Option(name: .long, help: "Drag position settle in ms.")
    var dragPositionMs: Int?

    @Option(name: .long, help: "Drag press hold for threshold in ms.")
    var dragPressMs: Int?

    @Option(name: .long, help: "Drag interpolation step delay in ms.")
    var dragStepMs: Int?

    @Option(name: .long, help: "Drag settle before release in ms.")
    var dragSettleMs: Int?

    @Option(name: .long, help: "Drag point density in pixels.")
    var dragPixelsPerStep: Double?

    @Option(name: .long, help: "Drag minimum interpolation steps.")
    var dragMinSteps: Int?

    // MARK: - Scroll Timing

    @Option(name: .long, help: "Scroll press-release gap in ms.")
    var scrollPressMs: Int?

    @Option(name: .long, help: "Scroll inter-tick delay in ms.")
    var scrollTickMs: Int?

    // MARK: - Keyboard Timing

    @Option(name: .long, help: "Key press hold duration in ms.")
    var keyHoldMs: Int?

    @Option(name: .long, help: "Combo modifier settle delay in ms.")
    var comboModMs: Int?

    // MARK: - Typing Timing

    @Option(name: .long, help: "Typing key hold in ms.")
    var typeKeyMs: Int?

    @Option(name: .long, help: "Typing inter-key delay in ms.")
    var typeInterKeyMs: Int?

    @Option(name: .long, help: "Typing shift settle in ms.")
    var typeShiftMs: Int?

    @Option(name: .long, help: "Paste clipboard settle in ms.")
    var pasteSettleMs: Int?

    // MARK: - Display Tuning

    @Option(name: .long, help: "Cursor crop radius in pixels.")
    var cursorCropRadius: Int?

    // MARK: - VNC Tuning

    @Option(name: .long, help: "Bits per sample.")
    var bitsPerSample: Int?

    @Option(name: .long, help: "Reconnect delay in seconds.")
    var reconnectDelay: Double?

    @Option(name: .long, help: "Max reconnect attempts.")
    var maxReconnectAttempts: Int?

    @Flag(name: .long, help: "Disable auto-reconnect on connection loss.")
    var noReconnect: Bool = false

    // MARK: - General

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
        if let timeout = connectTimeout { vncConfig.connectTimeout = timeout }
        if let bps = bitsPerSample { vncConfig.bitsPerSample = Int32(bps) }
        if let delay = reconnectDelay { vncConfig.reconnectDelay = delay }
        if let max = maxReconnectAttempts { vncConfig.maxReconnectAttempts = max }
        if noReconnect { vncConfig.autoReconnect = false }

        let vnc = VNCBridge(config: vncConfig)
        vnc.verbose = verbose

        vnc.onStateChange = { state in
            self.notify("vnc_state", params: ["state": .string("\(state)")])
        }

        do {
            try await vnc.connect()
        } catch {
            printError("VNC connection failed: \(error.localizedDescription)")
            throw ExitCode.failure
        }

        log("macOS mode: \(vnc.isMacOS)")

        Self.maxImageDimension = maxDimension
        let scaling = DisplayScaling(
            nativeWidth: vnc.framebufferWidth,
            nativeHeight: vnc.framebufferHeight,
            maxDimension: maxDimension
        )
        log("Display: \(scaling.nativeWidth)×\(scaling.nativeHeight) → \(scaling.scaledWidth)×\(scaling.scaledHeight)")

        notify("ready", params: [
            "scaledWidth": .int(scaling.scaledWidth),
            "scaledHeight": .int(scaling.scaledHeight),
        ])

        // Build timing from CLI overrides (all optional, defaults in InputTiming)
        var timing = InputTiming()
        if let v = clickHoldMs { timing.clickHoldUs = UInt32(v) * 1000 }
        if let v = doubleClickGapMs { timing.doubleClickGapUs = UInt32(v) * 1000 }
        if let v = hoverSettleMs { timing.hoverSettleUs = UInt32(v) * 1000 }
        if let v = dragPositionMs { timing.dragPositionUs = UInt32(v) * 1000 }
        if let v = dragPressMs { timing.dragPressUs = UInt32(v) * 1000 }
        if let v = dragStepMs { timing.dragStepUs = UInt32(v) * 1000 }
        if let v = dragSettleMs { timing.dragSettleUs = UInt32(v) * 1000 }
        if let v = dragPixelsPerStep { timing.dragPixelsPerStep = v }
        if let v = dragMinSteps { timing.dragMinSteps = v }
        if let v = scrollPressMs { timing.scrollPressUs = UInt32(v) * 1000 }
        if let v = scrollTickMs { timing.scrollTickUs = UInt32(v) * 1000 }
        if let v = keyHoldMs { timing.keyHoldUs = UInt32(v) * 1000 }
        if let v = comboModMs { timing.comboModUs = UInt32(v) * 1000 }
        if let v = typeKeyMs { timing.typeKeyUs = UInt32(v) * 1000 }
        if let v = typeInterKeyMs { timing.typeInterKeyUs = UInt32(v) * 1000 }
        if let v = typeShiftMs { timing.typeShiftUs = UInt32(v) * 1000 }
        if let v = pasteSettleMs { timing.pasteSettleUs = UInt32(v) * 1000 }
        if let v = cursorCropRadius { timing.cursorCropRadius = v }

        let input = InputController(vnc: vnc, timing: timing)

        await runCommandLoop(vnc: vnc, input: input, scaling: scaling)

        vnc.disconnect()
        log("Daemon stopped")
    }

    // MARK: - PC Emission

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = .sortedKeys
        return e
    }()

    func respond(_ response: PCResponse) {
        guard let data = try? Self.encoder.encode(response),
              let json = String(data: data, encoding: .utf8) else { return }
        print(json)
        fflush(stdout)
    }

    func notify(_ method: String, params: [String: PCValue]? = nil) {
        let notification = PCNotification(method: method, params: params)
        guard let data = try? Self.encoder.encode(notification),
              let json = String(data: data, encoding: .utf8) else { return }
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
