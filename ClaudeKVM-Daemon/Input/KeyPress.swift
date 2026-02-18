import Foundation

extension InputController {

    /// Single key: press → 30ms → release.
    func keyTap(_ keysym: UInt32) async throws {
        try await vnc.sendKeyEvent(key: keysym, down: true)
        usleep(timing.keyHoldUs)
        try await vnc.sendKeyEvent(key: keysym, down: false)
    }

    /// Key combo from keysym array. LIFO modifier order.
    /// Modifiers press (10ms each) → key press-release (30ms) → modifiers release reversed (10ms each).
    func keyCombo(_ keysyms: [UInt32]) async throws {
        guard keysyms.count >= 2 else {
            if let single = keysyms.first {
                try await keyTap(single)
            }
            return
        }

        let modifiers = Array(keysyms.dropLast())
        let key = keysyms.last!

        // Press modifiers in order
        for mod in modifiers {
            try await vnc.sendKeyEvent(key: mod, down: true)
            usleep(timing.comboModUs)
        }

        // Press-release main key
        try await vnc.sendKeyEvent(key: key, down: true)
        usleep(timing.keyHoldUs)
        try await vnc.sendKeyEvent(key: key, down: false)
        usleep(timing.comboModUs)

        // Release modifiers in reverse (LIFO)
        for mod in modifiers.reversed() {
            try await vnc.sendKeyEvent(key: mod, down: false)
            usleep(timing.comboModUs)
        }
    }

    /// Parse combo string like "cmd+c" → keysyms → execute.
    func keyCombo(_ combo: String) async throws {
        let parts = combo.lowercased().split(separator: "+").map { String($0).trimmingCharacters(in: .whitespaces) }
        let syms = parts.compactMap { namedKeyToKeysym($0) }
        guard syms.count == parts.count else {
            throw VNCError.sendFailed("Unknown key in combo: \(combo)")
        }
        try await keyCombo(syms)
    }
}
