/**
 *  █████╗ ██████╗  █████╗ ███████╗
 * ██╔══██╗██╔══██╗██╔══██╗██╔════╝
 * ███████║██████╔╝███████║███████╗
 * ██╔══██║██╔══██╗██╔══██║╚════██║
 * ██║  ██║██║  ██║██║  ██║███████║
 * ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 *
 * Copyright (c) 2025 Riza Emre ARAS <r.emrearas@proton.me>
 *
 * This file is part of Claude KVM.
 * Released under the MIT License - see LICENSE for details.
 */

import Foundation
import os
import CLibVNCClient

// MARK: - Connection State

enum VNCConnectionState: Sendable, CustomStringConvertible {
    case disconnected
    case connecting
    case connected(width: Int, height: Int)
    case error(String)

    var description: String {
        switch self {
        case .disconnected: "disconnected"
        case .connecting: "connecting"
        case let .connected(w, h): "connected (\(w)×\(h))"
        case let .error(msg): "error: \(msg)"
        }
    }

    var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }
}

// MARK: - Errors

enum VNCError: LocalizedError {
    case notConnected
    case connectionFailed(String)
    case alreadyConnected
    case messageLoopFailed
    case framebufferAllocationFailed
    case sendFailed(String)

    var errorDescription: String? {
        switch self {
        case .notConnected: "Not connected to VNC server."
        case .connectionFailed(let msg): "VNC connection failed: \(msg)"
        case .alreadyConnected: "Already connected to a VNC server."
        case .messageLoopFailed: "VNC message loop encountered an error."
        case .framebufferAllocationFailed: "Failed to allocate framebuffer."
        case .sendFailed(let msg): "Failed to send VNC event: \(msg)"
        }
    }
}

// MARK: - Configuration

struct VNCConfiguration {
    var host: String = "127.0.0.1"
    var port: Int = 5900
    var username: String?
    var password: String?
    var bitsPerSample: Int32 = 8
    var samplesPerPixel: Int32 = 3
    var bytesPerPixel: Int32 = 4
    var autoReconnect: Bool = true
    var reconnectDelay: TimeInterval = 2.0
    var maxReconnectAttempts: Int = 10
    var messageLoopInterval: UInt32 = 500 // microseconds for WaitForMessage
}

// MARK: - VNCBridge

/// Swift bridge over LibVNCClient (C). Manages a persistent VNC connection
/// with a framebuffer accessible as a raw RGBA pointer (zero-copy for VLM).
final class VNCBridge: @unchecked Sendable {

    // MARK: Public Properties

    var verbose = false
    var onStateChange: ((VNCConnectionState) -> Void)?
    var onFrameBufferUpdate: ((Int, Int, Int, Int) -> Void)?
    var onFrameComplete: (() -> Void)?
    var onClipboardText: ((String) -> Void)?

    // MARK: Private Properties

    private var client: UnsafeMutablePointer<rfbClient>?
    private let stateStorage = OSAllocatedUnfairLock(initialState: VNCConnectionState.disconnected)
    private let isRunning = OSAllocatedUnfairLock(initialState: false)
    private var messageLoopTask: Task<Void, Never>?
    private let messageQueue = DispatchQueue(label: "vnc.message-loop", qos: .userInteractive)
    let config: VNCConfiguration
    private var reconnectCount = 0
    fileprivate var framebufferUpdateContinuation: AsyncStream<Void>.Continuation?
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

        // 1. Allocate rfbClient
        guard let newClient = rfbGetClient(
            config.bitsPerSample, config.samplesPerPixel, config.bytesPerPixel
        ) else {
            updateState(.error("rfbGetClient failed"))
            throw VNCError.connectionFailed("rfbGetClient returned nil")
        }

        // 2. Configure client
        self.client = newClient
        newClient.pointee.serverPort = Int32(config.port)
        newClient.pointee.serverHost = strdup(config.host)

        // 3. Store self reference for C callbacks
        let unmanaged = Unmanaged.passUnretained(self)
        rfbClientSetClientData(newClient, &vncBridgeTag, unmanaged.toOpaque())

        // 4. Register C callbacks
        newClient.pointee.MallocFrameBuffer = vncMallocFrameBuffer
        newClient.pointee.GotFrameBufferUpdate = vncGotFrameBufferUpdate
        newClient.pointee.FinishedFrameBufferUpdate = vncFinishedFrameBufferUpdate
        newClient.pointee.GetPassword = vncGetPassword
        newClient.pointee.GetCredential = vncGetCredential
        newClient.pointee.GotXCutText = vncGotXCutText

        // 5. Connect (TCP + RFB handshake)
        // rfbInitClient calls rfbClientCleanup internally on failure — do NOT double-free
        var argc: Int32 = 0
        guard rfbInitClient(newClient, &argc, nil) != 0 else {
            self.client = nil
            updateState(.error("Connection refused or handshake failed"))
            throw VNCError.connectionFailed("\(config.host):\(config.port)")
        }

        log("Connected: \(newClient.pointee.width)×\(newClient.pointee.height)")
        reconnectCount = 0

        // 6. Start message loop
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

    // MARK: - Framebuffer Access (Zero-Copy)

    /// Direct RGBA pointer to the VNC framebuffer. Nil if not connected.
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

    /// Safe framebuffer access. Body receives (buffer, width, height).
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

    /// AsyncStream that yields each time a full framebuffer update completes.
    func frameUpdates() -> AsyncStream<Void> {
        AsyncStream { continuation in
            self.framebufferUpdateContinuation = continuation
            continuation.onTermination = { @Sendable _ in
                self.framebufferUpdateContinuation = nil
            }
        }
    }

    // MARK: - Input (dispatched to messageQueue for thread safety)

    func sendMouseEvent(x: Int, y: Int, buttonMask: Int = 0) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            messageQueue.async { [self] in
                guard let client else {
                    continuation.resume(throwing: VNCError.notConnected)
                    return
                }
                // rfbBool: TRUE = -1, FALSE = 0
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
                let rfbDown: rfbBool = down ? -1 : 0
                if SendKeyEvent(client, key, rfbDown) != 0 {
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
                let len = Int32(cStr.count - 1) // exclude null terminator
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
                    0 // non-incremental = full
                ) != 0 {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: VNCError.sendFailed("framebuffer update request"))
                }
            }
        }
    }

    // MARK: - Message Loop (Private)

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

                        // result == 0: timeout, no message — keep polling
                        // Send incremental update request to keep frames flowing
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
        // Check if this was a deliberate disconnect
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

        // Clean up current client
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

    // MARK: - State Helpers (fileprivate for callbacks)

    fileprivate func updateState(_ newState: VNCConnectionState) {
        stateStorage.withLock { $0 = newState }
        onStateChange?(newState)
        stateStreamContinuation?.yield(newState)
        log("State: \(newState)")
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

// MARK: - C Callback Trampolines

/// Tag for rfbClientSetClientData/rfbClientGetClientData.
/// The address of this variable is the key — the value is irrelevant.
var vncBridgeTag: UInt8 = 0

/// Retrieve the VNCBridge instance from a C rfbClient pointer.
func bridge(from client: UnsafeMutablePointer<rfbClient>?) -> VNCBridge? {
    guard let client else { return nil }
    guard let ptr = rfbClientGetClientData(client, &vncBridgeTag) else { return nil }
    return Unmanaged<VNCBridge>.fromOpaque(ptr).takeUnretainedValue()
}

/// Called by LibVNC when the framebuffer needs to be (re)allocated.
private func vncMallocFrameBuffer(_ client: UnsafeMutablePointer<rfbClient>?) -> rfbBool {
    guard let client else { return 0 }
    guard let b = bridge(from: client) else { return 0 }

    let width = Int(client.pointee.width)
    let height = Int(client.pointee.height)
    let bpp = Int(client.pointee.format.bitsPerPixel) / 8
    let size = width * height * bpp

    // Free previous buffer if resizing
    if client.pointee.frameBuffer != nil {
        free(client.pointee.frameBuffer)
    }

    guard let buffer = malloc(size) else {
        b.log("Failed to allocate framebuffer: \(width)×\(height)×\(bpp)")
        return 0 // FALSE
    }

    // Zero-fill for clean initial state
    memset(buffer, 0, size)
    client.pointee.frameBuffer = buffer.assumingMemoryBound(to: UInt8.self)
    b.log("Framebuffer allocated: \(width)×\(height) (\(size) bytes)")
    b.updateState(.connected(width: width, height: height))

    return -1 // rfbBool TRUE = -1
}

/// Called per rectangle in a framebuffer update.
private func vncGotFrameBufferUpdate(
    _ client: UnsafeMutablePointer<rfbClient>?,
    _ x: Int32, _ y: Int32, _ w: Int32, _ h: Int32
) {
    guard let b = bridge(from: client) else { return }
    b.onFrameBufferUpdate?(Int(x), Int(y), Int(w), Int(h))
}

/// Called once when all rectangles in a framebuffer update have been received.
private func vncFinishedFrameBufferUpdate(_ client: UnsafeMutablePointer<rfbClient>?) {
    guard let b = bridge(from: client) else { return }
    b.onFrameComplete?()
    b.framebufferUpdateContinuation?.yield(())
}

/// Called by LibVNC when a password is needed for VNC authentication.
/// LibVNC will call free() on the returned pointer.
private func vncGetPassword(_ client: UnsafeMutablePointer<rfbClient>?) -> UnsafeMutablePointer<CChar>? {
    guard let b = bridge(from: client) else { return nil }
    guard let password = b.config.password else { return nil }
    return strdup(password)
}

/// Called when the server sends clipboard text.
private func vncGotXCutText(
    _ client: UnsafeMutablePointer<rfbClient>?,
    _ text: UnsafePointer<CChar>?, _ len: Int32
) {
    guard let b = bridge(from: client) else { return }
    guard let text else { return }
    let string = String(cString: text)
    b.onClipboardText?(string)
}
