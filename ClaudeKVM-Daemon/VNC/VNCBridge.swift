import Foundation
import os
import CLibVNCClient

/// Swift bridge over LibVNCClient (C). Manages a persistent VNC connection
/// with a framebuffer accessible as a raw RGBA pointer (zero-copy).
final class VNCBridge: @unchecked Sendable {

    // MARK: Public Properties

    var verbose = false
    /// Whether the VNC server is macOS Apple VNC (detected from RFB version 003.889 or --macos flag)
    var isMacOS: Bool = false
    var onStateChange: ((VNCConnectionState) -> Void)?
    var onFrameBufferUpdate: ((Int, Int, Int, Int) -> Void)?
    var onFrameComplete: (() -> Void)?
    var onClipboardText: ((String) -> Void)?
    var onCursorPos: ((Int, Int) -> Void)?

    // MARK: Internal Properties (accessed by VNCCallbacks)

    let config: VNCConfiguration
    var framebufferUpdateContinuation: AsyncStream<Void>.Continuation?
    /// Server-reported cursor position (updated by HandleCursorPos callback)
    var serverCursorX: Int = 0
    var serverCursorY: Int = 0

    // MARK: Private Properties

    private var client: UnsafeMutablePointer<rfbClient>?
    private let stateStorage = OSAllocatedUnfairLock(initialState: VNCConnectionState.disconnected)
    private let isRunning = OSAllocatedUnfairLock(initialState: false)
    private var messageLoopTask: Task<Void, Never>?
    private let messageQueue = DispatchQueue(label: "vnc.message-loop", qos: .userInteractive)
    private var reconnectCount = 0
    private var stateStreamContinuation: AsyncStream<VNCConnectionState>.Continuation?

    // MARK: Init / Deinit

    init(config: VNCConfiguration = .init()) {
        self.config = config
    }

    deinit {
        disconnect()
    }

    // MARK: - Connection Lifecycle

    func connect() async throws {
        guard !stateStorage.withLock({ $0.isConnected }) else {
            throw VNCError.alreadyConnected
        }

        updateState(.connecting)
        log("Connecting to \(config.host):\(config.port)")

        guard let newClient = rfbGetClient(
            config.bitsPerSample, config.samplesPerPixel, config.bytesPerPixel
        ) else {
            updateState(.error("rfbGetClient failed"))
            throw VNCError.connectionFailed("rfbGetClient returned nil")
        }

        self.client = newClient
        newClient.pointee.serverPort = Int32(config.port)
        newClient.pointee.serverHost = strdup(config.host)

        let unmanaged = Unmanaged.passUnretained(self)
        rfbClientSetClientData(newClient, &vncBridgeTag, unmanaged.toOpaque())

        newClient.pointee.MallocFrameBuffer = vncMallocFrameBuffer
        newClient.pointee.GotFrameBufferUpdate = vncGotFrameBufferUpdate
        newClient.pointee.FinishedFrameBufferUpdate = vncFinishedFrameBufferUpdate
        newClient.pointee.GetPassword = vncGetPassword
        newClient.pointee.GetCredential = vncGetCredential
        newClient.pointee.GotXCutText = vncGotXCutText
        newClient.pointee.HandleCursorPos = vncHandleCursorPos
        newClient.pointee.appData.useRemoteCursor = -1 // request PointerPos encoding

        if config.connectTimeout > 0 {
            newClient.pointee.connectTimeout = UInt32(config.connectTimeout)
        }

        // rfbInitClient calls rfbClientCleanup internally on failure — do NOT double-free
        var argc: Int32 = 0
        guard rfbInitClient(newClient, &argc, nil) != 0 else {
            self.client = nil
            updateState(.error("Connection refused or handshake failed"))
            throw VNCError.connectionFailed("\(config.host):\(config.port)")
        }

        log("Connected: \(newClient.pointee.width)×\(newClient.pointee.height)")
        reconnectCount = 0

        // macOS detection happens in vncGetCredential (ARD auth type 30)
        log("macOS mode after connect: \(isMacOS)")

        startMessageLoop()
    }

    func disconnect() {
        log("Disconnecting")
        isRunning.withLock { $0 = false }
        messageLoopTask?.cancel()
        messageLoopTask = nil

        if let client {
            if client.pointee.frameBuffer != nil {
                free(client.pointee.frameBuffer)
                client.pointee.frameBuffer = nil
            }
            if client.pointee.serverHost != nil {
                free(client.pointee.serverHost)
                client.pointee.serverHost = nil
            }
            rfbClientCleanup(client)
            self.client = nil
        }

        updateState(.disconnected)
    }

    // MARK: - State

    var connectionState: VNCConnectionState {
        stateStorage.withLock { $0 }
    }

    func stateStream() -> AsyncStream<VNCConnectionState> {
        AsyncStream { continuation in
            self.stateStreamContinuation = continuation
            continuation.yield(self.connectionState)
            continuation.onTermination = { @Sendable _ in
                self.stateStreamContinuation = nil
            }
        }
    }

    func updateState(_ newState: VNCConnectionState) {
        stateStorage.withLock { $0 = newState }
        onStateChange?(newState)
        stateStreamContinuation?.yield(newState)
        log("State: \(newState)")
    }

    // MARK: - Framebuffer Access (Zero-Copy)

    var framebufferPointer: UnsafeRawPointer? {
        guard let client, client.pointee.frameBuffer != nil else { return nil }
        return UnsafeRawPointer(client.pointee.frameBuffer)
    }

    var framebufferWidth: Int {
        guard let client else { return 0 }
        return Int(client.pointee.width)
    }

    var framebufferHeight: Int {
        guard let client else { return 0 }
        return Int(client.pointee.height)
    }

    var framebufferBytesPerRow: Int {
        guard let client else { return 0 }
        let bpp = Int(client.pointee.format.bitsPerPixel) / 8
        return Int(client.pointee.width) * bpp
    }

    func withFramebuffer<T>(_ body: (UnsafeRawBufferPointer, Int, Int) -> T) -> T? {
        guard let client, client.pointee.frameBuffer != nil else { return nil }
        let width = Int(client.pointee.width)
        let height = Int(client.pointee.height)
        let bpp = Int(client.pointee.format.bitsPerPixel) / 8
        let size = width * height * bpp
        let buffer = UnsafeRawBufferPointer(
            start: UnsafeRawPointer(client.pointee.frameBuffer),
            count: size
        )
        return body(buffer, width, height)
    }

    func frameUpdates() -> AsyncStream<Void> {
        AsyncStream { continuation in
            self.framebufferUpdateContinuation = continuation
            continuation.onTermination = { @Sendable _ in
                self.framebufferUpdateContinuation = nil
            }
        }
    }

    // MARK: - Input

    func sendMouseEvent(x: Int, y: Int, buttonMask: Int = 0) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            messageQueue.async { [self] in
                guard let client else {
                    continuation.resume(throwing: VNCError.notConnected)
                    return
                }
                if SendPointerEvent(client, Int32(x), Int32(y), Int32(buttonMask)) != 0 {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: VNCError.sendFailed("pointer event"))
                }
            }
        }
    }

    func sendKeyEvent(key: UInt32, down: Bool) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            messageQueue.async { [self] in
                guard let client else {
                    continuation.resume(throwing: VNCError.notConnected)
                    return
                }
                // macOS Apple VNC expects Super_L/R for Command, not Meta_L/R
                var remappedKey = key
                if isMacOS {
                    if key == 0xFFE7 { remappedKey = 0xFFEB }
                    if key == 0xFFE8 { remappedKey = 0xFFEC }
                }
                let rfbDown: rfbBool = down ? -1 : 0
                if SendKeyEvent(client, remappedKey, rfbDown) != 0 {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: VNCError.sendFailed("key event"))
                }
            }
        }
    }

    func sendKeyTap(key: UInt32) async throws {
        try await sendKeyEvent(key: key, down: true)
        try await sendKeyEvent(key: key, down: false)
    }

    func sendClipboardText(_ text: String) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            messageQueue.async { [self] in
                guard let client else {
                    continuation.resume(throwing: VNCError.notConnected)
                    return
                }
                var cStr = Array(text.utf8CString)
                let len = Int32(cStr.count - 1)
                if SendClientCutText(client, &cStr, len) != 0 {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: VNCError.sendFailed("clipboard text"))
                }
            }
        }
    }

    func requestFullUpdate() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            messageQueue.async { [self] in
                guard let client else {
                    continuation.resume(throwing: VNCError.notConnected)
                    return
                }
                if SendFramebufferUpdateRequest(
                    client, 0, 0,
                    Int32(client.pointee.width),
                    Int32(client.pointee.height),
                    0
                ) != 0 {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: VNCError.sendFailed("framebuffer update request"))
                }
            }
        }
    }

    // MARK: - Message Loop

    private func startMessageLoop() {
        isRunning.withLock { $0 = true }

        messageLoopTask = Task { [weak self] in
            guard let self else { return }

            while !Task.isCancelled && self.isRunning.withLock({ $0 }) {
                let shouldContinue = await withCheckedContinuation { continuation in
                    self.messageQueue.async {
                        guard let client = self.client else {
                            continuation.resume(returning: false)
                            return
                        }

                        let result = WaitForMessage(client, self.config.messageLoopInterval)
                        if result < 0 {
                            continuation.resume(returning: false)
                            return
                        }

                        if result > 0 {
                            if HandleRFBServerMessage(client) == 0 {
                                continuation.resume(returning: false)
                                return
                            }
                        }

                        _ = SendIncrementalFramebufferUpdateRequest(client)
                        continuation.resume(returning: true)
                    }
                }

                if !shouldContinue {
                    break
                }
            }

            self.handleDisconnection()
        }
    }

    private func handleDisconnection() {
        guard isRunning.withLock({ $0 }) else { return }
        isRunning.withLock { $0 = false }

        log("Connection lost")
        updateState(.error("Connection lost"))

        guard config.autoReconnect else {
            updateState(.disconnected)
            return
        }

        guard reconnectCount < config.maxReconnectAttempts else {
            log("Max reconnect attempts reached (\(config.maxReconnectAttempts))")
            updateState(.disconnected)
            return
        }

        reconnectCount += 1
        let delay = config.reconnectDelay * Double(min(reconnectCount, 5))
        log("Reconnecting (\(reconnectCount)/\(config.maxReconnectAttempts)) in \(delay)s...")

        if let client {
            if client.pointee.frameBuffer != nil {
                free(client.pointee.frameBuffer)
                client.pointee.frameBuffer = nil
            }
            if client.pointee.serverHost != nil {
                free(client.pointee.serverHost)
                client.pointee.serverHost = nil
            }
            rfbClientCleanup(client)
            self.client = nil
        }

        Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            do {
                try await connect()
            } catch {
                log("Reconnect failed: \(error.localizedDescription)")
                handleDisconnection()
            }
        }
    }

    // MARK: - Logging

    func log(_ message: String) {
        guard verbose else { return }
        FileHandle.standardError.write(Data("[VNC \(timestamp())] \(message)\n".utf8))
    }

    private func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }
}
