import Foundation
import CLibVNCClient

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

/// Called per rectangle in a framebuffer update.
func vncGotFrameBufferUpdate(
    _ client: UnsafeMutablePointer<rfbClient>?,
    _ x: Int32, _ y: Int32, _ w: Int32, _ h: Int32
) {
    guard let b = bridge(from: client) else { return }
    b.onFrameBufferUpdate?(Int(x), Int(y), Int(w), Int(h))
}

/// Called once when all rectangles in a framebuffer update have been received.
func vncFinishedFrameBufferUpdate(_ client: UnsafeMutablePointer<rfbClient>?) {
    guard let b = bridge(from: client) else { return }
    FileHandle.standardError.write(Data("[FRAME]\n".utf8))
    b.onFrameComplete?()
    b.framebufferUpdateContinuation?.yield(())
}

/// Called by LibVNC when a password is needed for VNC authentication.
/// LibVNC will call free() on the returned pointer.
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
    let string = String(cString: text)
    b.onClipboardText?(string)
}

// MARK: - Cursor Position

/// Called by LibVNC when the server reports cursor position (PointerPos encoding).
func vncHandleCursorPos(
    _ client: UnsafeMutablePointer<rfbClient>?,
    _ x: Int32, _ y: Int32
) -> rfbBool {
    guard let b = bridge(from: client) else { return -1 }
    FileHandle.standardError.write(Data("[CURSOR] \(x),\(y)\n".utf8))
    b.serverCursorX = Int(x)
    b.serverCursorY = Int(y)
    b.onCursorPos?(Int(x), Int(y))
    return -1 // TRUE
}

// MARK: - ARD Authentication

/// Called by LibVNCClient when ARD auth needs username + password.
/// LibVNCClient will call free() on the returned credential struct.
func vncGetCredential(
    _ client: UnsafeMutablePointer<rfbClient>?,
    _ credentialType: Int32
) -> UnsafeMutablePointer<rfbCredential>? {
    guard let client else { return nil }
    guard let b = bridge(from: client) else { return nil }

    if credentialType == rfbCredentialTypeUser {
        // ARD auth (type 30) requires credentials — this IS macOS
        b.isMacOS = true
        FileHandle.standardError.write(Data("[ARD] macOS detected via credential request\n".utf8))

        let username = b.config.username ?? ""
        let password = b.config.password ?? ""

        let cred = UnsafeMutablePointer<rfbCredential>.allocate(capacity: 1)
        cred.pointee.userCredential.username = strdup(username)
        cred.pointee.userCredential.password = strdup(password)
        return cred
    }

    return nil
}
