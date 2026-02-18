import Foundation

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
    var connectTimeout: Int = 0
    var autoReconnect: Bool = true
    var reconnectDelay: TimeInterval = 2.0
    var maxReconnectAttempts: Int = 10
    var messageLoopInterval: UInt32 = 500
}
