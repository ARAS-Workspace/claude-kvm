import Foundation

extension InputController {

    /// Teleport. Single pointerEvent, no wait.
    func mouseMove(x: Int, y: Int) async throws {
        try await vnc.sendMouseEvent(x: x, y: y, buttonMask: 0)
        cursorX = x
        cursorY = y
    }

    /// Move + settle wait for hover recognition.
    func mouseHover(x: Int, y: Int) async throws {
        try await mouseMove(x: x, y: y)
        usleep(400_000) // 400ms hover settle
    }

    /// Relative cursor nudge from current position.
    func mouseNudge(dx: Int, dy: Int) async throws {
        let newX = max(0, cursorX + dx)
        let newY = max(0, cursorY + dy)
        try await mouseMove(x: newX, y: newY)
    }
}
