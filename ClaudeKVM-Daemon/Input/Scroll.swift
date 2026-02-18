import Foundation

extension InputController {

    /// Scroll: per tick press→10ms→release→20ms.
    /// One event per tick, deterministic.
    func scroll(x: Int, y: Int, direction: ScrollDirection, amount: Int = 3) async throws {
        try await vnc.sendMouseEvent(x: x, y: y, buttonMask: 0)
        cursorX = x
        cursorY = y

        let mask = direction.buttonMask

        for _ in 0..<amount {
            try await vnc.sendMouseEvent(x: x, y: y, buttonMask: mask)
            usleep(timing.scrollPressUs)
            try await vnc.sendMouseEvent(x: x, y: y, buttonMask: 0)
            usleep(timing.scrollTickUs)
        }
    }
}
