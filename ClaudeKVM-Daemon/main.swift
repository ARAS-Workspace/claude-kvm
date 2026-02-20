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

            Copyright (c) 2026 Riza Emre ARAS <r.emrearas@proton.me>
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

              Detection:
                detect_elements                         OCR text detection with bounding boxes

              Configuration:
                configure      {<params>}               Set timing/display params at runtime
                configure      {reset: true}            Reset all params to defaults
                get_timing                              Get current timing + display params

              Control:
                wait           {ms?}                    Pause (default 500ms)
                health                                  Connection state + display info
                shutdown                                Graceful exit

            CONFIGURE PARAMETERS (all optional, runtime-adjustable via PC):
              All timing values are in milliseconds.
              Default values are used at startup — no CLI overrides needed.
              Use the "configure" method to change values at runtime.
              Use "get_timing" to inspect current values.

              Display:
                max_dimension        Max screenshot dimension in px    (default: 1280)
                cursor_crop_radius   Cursor crop radius in px         (default: 150)

              Mouse:
                click_hold_ms        Click hold duration               (default: 50)
                double_click_gap_ms  Inter-click gap                   (default: 50)
                hover_settle_ms      Hover settle wait                 (default: 400)

              Drag:
                drag_position_ms     Position settle before press      (default: 30)
                drag_press_ms        Press hold for drag threshold     (default: 50)
                drag_step_ms         Between interpolation points      (default: 5)
                drag_settle_ms       Settle before release             (default: 30)
                drag_pixels_per_step Point density in pixels           (default: 20)
                drag_min_steps       Minimum interpolation steps       (default: 10)

              Scroll:
                scroll_press_ms      Scroll press-release gap          (default: 10)
                scroll_tick_ms       Inter-tick delay                  (default: 20)

              Keyboard:
                key_hold_ms          Single key hold duration          (default: 30)
                combo_mod_ms         Modifier settle delay             (default: 10)

              Typing:
                type_key_ms          Key hold during typing            (default: 20)
                type_inter_key_ms    Between characters                (default: 20)
                type_shift_ms        Shift key settle                  (default: 10)
                paste_settle_ms      After clipboard write             (default: 30)

            CONFIGURE EXAMPLES:
              Set timing:
                {"method":"configure","params":{"click_hold_ms":80,"key_hold_ms":50},"id":1}
                → {"result":{"detail":"OK — changed: click_hold_ms, key_hold_ms"},"id":1}

              Change display scaling:
                {"method":"configure","params":{"max_dimension":960},"id":2}
                → {"result":{"detail":"OK — changed: max_dimension","scaledWidth":960,"scaledHeight":584},"id":2}

              Reset to defaults:
                {"method":"configure","params":{"reset":true},"id":3}
                → {"result":{"detail":"OK — reset to defaults","timing":{...}},"id":3}

              Get current values:
                {"method":"get_timing","id":4}
                → {"result":{"timing":{"click_hold_ms":50,...},"scaledWidth":1280,"scaledHeight":779},"id":4}

            NOTIFICATIONS (server → caller, no id):
              vnc_state      {state}                    Connection state changes
              ready          {scaledWidth, scaledHeight} VNC connected, dimensions

            COORDINATE SYSTEM:
              All coordinates are in scaled display space.
              Native resolution is scaled to fit within max_dimension (default 1280).
              Example: 4220×2568 native → 1280×779 scaled (at max 1280)
              max_dimension can be changed at runtime via configure.

            macOS DETECTION:
              Automatic via ARD auth type 30 credential request.
              When detected, Meta_L keysyms are remapped to Super_L
              for correct Command key behavior on Apple VNC servers.

            EXAMPLES:
              claude-kvm-daemon --host 192.168.1.100 --port 5900 --password secret
              claude-kvm-daemon --host 10.0.0.1 --port 5900 --username admin --password pass -v
              claude-kvm-daemon --host 10.0.0.1 --port 5900 --password pass --max-dimension 800

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

    @Option(name: .long, help: "Initial max screenshot dimension in pixels (adjustable at runtime via configure).")
    var maxDimension: Int = 1280

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

        let input = InputController(vnc: vnc)

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
