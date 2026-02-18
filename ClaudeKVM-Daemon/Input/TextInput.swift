import Foundation

extension InputController {

    /// Type text character by character. Fixed timing, zero randomness.
    /// Per char: [shift down 10ms] → key down 20ms → key up → [10ms shift up] → 20ms inter-key.
    func typeText(_ text: String) async throws {
        for ch in text {
            let (keysym, needsShift) = charToKeysym(ch)
            guard keysym != 0 else { continue }

            if needsShift {
                try await vnc.sendKeyEvent(key: KeySym.shiftLeft, down: true)
                usleep(timing.typeShiftUs)
            }

            try await vnc.sendKeyEvent(key: keysym, down: true)
            usleep(timing.typeKeyUs)
            try await vnc.sendKeyEvent(key: keysym, down: false)

            if needsShift {
                usleep(timing.typeShiftUs)
                try await vnc.sendKeyEvent(key: KeySym.shiftLeft, down: false)
            }

            usleep(timing.typeInterKeyUs)
        }
    }

    /// Paste via VNC clipboard + combo. Always preferred over typeText.
    /// clientCutText → 30ms → cmd+v (macOS) or ctrl+v (other).
    func pasteText(_ text: String) async throws {
        try await vnc.sendClipboardText(text)
        usleep(timing.pasteSettleUs)
        if vnc.isMacOS {
            try await keyCombo("cmd+v")
        } else {
            try await keyCombo("ctrl+v")
        }
    }
}
