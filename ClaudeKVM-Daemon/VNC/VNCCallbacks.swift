import Foundation
import CLibVNCClient

// MARK: - C Callback Trampolines

/// Tag for rfbClientSetClientData/rfbClientGetClientData.
var vncBridgeTag: UInt8 = 0

/// Retrieve the VNCBridge instance from a C rfbClient pointer.
func bridge(from client: UnsafeMutablePointer<rfbClient>?) -> VNCBridge? {
    guard let client else { return nil }
    guard let ptr = rfbClientGetClientData(client, &vncBridgeTag) else { return nil }
    return Unmanaged<VNCBridge>.fromOpaque(ptr).takeUnretainedValue()
}

/// Called by LibVNC when the framebuffer needs to be (re)allocated.
func vncMallocFrameBuffer(_ client: UnsafeMutablePointer<rfbClient>?) -> rfbBool {
    guard let client else { return 0 }
    guard let b = bridge(from: client) else { return 0 }

    let width = Int(client.pointee.width)
    let height = Int(client.pointee.height)
    let bpp = Int(client.pointee.format.bitsPerPixel) / 8
    let size = width * height * bpp

    if client.pointee.frameBuffer != nil {
        free(client.pointee.frameBuffer)
    }

    guard let buffer = malloc(size) else {
        b.log("Failed to allocate framebuffer: \(width)×\(height)×\(bpp)")
        return 0
    }

    memset(buffer, 0, size)
    client.pointee.frameBuffer = buffer.assumingMemoryBound(to: UInt8.self)
    b.log("Framebuffer allocated: \(width)×\(height) (\(size) bytes)")
    b.updateState(.connected(width: width, height: height))

    return -1 // rfbBool TRUE = -1
}

/// Called once when all rectangles in a framebuffer update have been received.
func vncFinishedFrameBufferUpdate(_ client: UnsafeMutablePointer<rfbClient>?) {
    guard let b = bridge(from: client) else { return }
    b.framebufferUpdateContinuation?.yield(())
}

/// Called by LibVNC when a password is needed for VNC authentication.
func vncGetPassword(_ client: UnsafeMutablePointer<rfbClient>?) -> UnsafeMutablePointer<CChar>? {
    guard let b = bridge(from: client) else { return nil }
    guard let password = b.config.password else { return nil }
    return strdup(password)
}

/// Called when the server sends clipboard text.
func vncGotXCutText(
    _ client: UnsafeMutablePointer<rfbClient>?,
    _ text: UnsafePointer<CChar>?, _ len: Int32
) {
    guard let b = bridge(from: client) else { return }
    guard let text else { return }
    b.log("Clipboard: \(String(cString: text))")
}

// MARK: - ARD Authentication

/// Called by LibVNCClient when ARD auth needs username + password.
func vncGetCredential(
    _ client: UnsafeMutablePointer<rfbClient>?,
    _ credentialType: Int32
) -> UnsafeMutablePointer<rfbCredential>? {
    guard let client else { return nil }
    guard let b = bridge(from: client) else { return nil }

    if credentialType == rfbCredentialTypeUser {
        // ARD auth (type 30) requires credentials — this IS macOS
        b.isMacOS = true
        b.log("macOS detected via ARD credential request")

        let username = b.config.username ?? ""
        let password = b.config.password ?? ""

        let cred = UnsafeMutablePointer<rfbCredential>.allocate(capacity: 1)
        cred.pointee.userCredential.username = strdup(username)
        cred.pointee.userCredential.password = strdup(password)
        return cred
    }

    return nil
}
