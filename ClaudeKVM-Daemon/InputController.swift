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

// High-level mouse/keyboard input controller built on VNCBridge.
// Composes atomic VNC events into human-like actions (click, drag, type, combo).

import Foundation
import CLibVNCClient

// MARK: - Button Masks (VNC RFB protocol)

enum MouseButton: Int {
    case left   = 1
    case middle = 2
    case right  = 4
    case scrollUp    = 8
    case scrollDown  = 16
    case scrollLeft  = 32
    case scrollRight = 64
}

// MARK: - Timing Configuration

struct InputTiming {
    var clickHoldUs: UInt32    = 50_000   // 50ms — click press duration
    var keyHoldUs: UInt32      = 40_000   // 40ms — key press duration
    var doubleClickUs: UInt32  = 50_000   // 50ms — between double click
    var dragStepUs: UInt32     = 10_000   // 10ms — between drag interpolation steps
    var dragPressUs: UInt32    = 80_000   // 80ms — hold before drag starts
    var scrollEventUs: UInt32  = 8_000    // 8ms  — between scroll press/release
    var scrollStepUs: UInt32   = 25_000   // 25ms — between scroll steps
    var comboKeyUs: UInt32     = 40_000   // 40ms — between modifier presses
    var comboWaitUs: UInt32    = 60_000   // 60ms — after all keys pressed
    var typeMinUs: UInt32      = 20_000   // 20ms — min delay between typed chars
    var typeMaxUs: UInt32      = 60_000   // 60ms — max delay between typed chars
    var shiftUs: UInt32        = 15_000   // 15ms — shift key settle time
    var scrollEventsPerStep: Int = 5      // events per scroll amount unit
    var dragPixelsPerStep: Double = 30.0  // pixels between drag interpolation points
}

// MARK: - InputController

final class InputController {
    let vnc: VNCBridge
    var timing: InputTiming

    private var cursorX: Int = 0
    private var cursorY: Int = 0

    init(vnc: VNCBridge, timing: InputTiming = .init()) {
        self.vnc = vnc
        self.timing = timing
    }

    // MARK: - Mouse Move

    func mouseMove(x: Int, y: Int) async throws {
        try await vnc.sendMouseEvent(x: x, y: y, buttonMask: 0)
        cursorX = x
        cursorY = y
    }

    // MARK: - Mouse Hover (move + wait)

    func mouseHover(x: Int, y: Int) async throws {
        try await mouseMove(x: x, y: y)
        usleep(400_000) // 400ms settle
    }

    // MARK: - Mouse Nudge (relative)

    func mouseNudge(dx: Int, dy: Int) async throws {
        let newX = max(0, cursorX + dx)
        let newY = max(0, cursorY + dy)
        try await mouseMove(x: newX, y: newY)
    }

    /// Current cursor position
    var cursorPosition: (x: Int, y: Int) { (cursorX, cursorY) }

    // MARK: - Mouse Click

    func mouseClick(x: Int, y: Int, button: MouseButton = .left) async throws {
        // Move to position
        try await vnc.sendMouseEvent(x: x, y: y, buttonMask: 0)
        cursorX = x
        cursorY = y

        // Press
        try await vnc.sendMouseEvent(x: x, y: y, buttonMask: button.rawValue)
        usleep(timing.clickHoldUs)

        // Release
        try await vnc.sendMouseEvent(x: x, y: y, buttonMask: 0)
    }

    func mouseDoubleClick(x: Int, y: Int) async throws {
        try await mouseClick(x: x, y: y, button: .left)
        usleep(timing.doubleClickUs)
        try await mouseClick(x: x, y: y, button: .left)
    }

    func mouseRightClick(x: Int, y: Int) async throws {
        try await mouseClick(x: x, y: y, button: .right)
    }

    // MARK: - Mouse Drag

    func mouseDrag(fromX: Int, fromY: Int, toX: Int, toY: Int) async throws {
        let dx = Double(toX - fromX)
        let dy = Double(toY - fromY)
        let distance = (dx * dx + dy * dy).squareRoot()
        let steps = max(5, Int((distance / timing.dragPixelsPerStep).rounded(.up)))

        // Move to start
        try await vnc.sendMouseEvent(x: fromX, y: fromY, buttonMask: 0)
        cursorX = fromX
        cursorY = fromY

        // Press
        try await vnc.sendMouseEvent(x: fromX, y: fromY, buttonMask: MouseButton.left.rawValue)
        usleep(timing.dragPressUs)

        // Interpolate
        for i in 1...steps {
            let t = Double(i) / Double(steps)
            let ix = fromX + Int((dx * t).rounded())
            let iy = fromY + Int((dy * t).rounded())
            try await vnc.sendMouseEvent(x: ix, y: iy, buttonMask: MouseButton.left.rawValue)
            usleep(timing.dragStepUs)
        }

        // Release
        try await vnc.sendMouseEvent(x: toX, y: toY, buttonMask: 0)
        cursorX = toX
        cursorY = toY
    }

    // MARK: - Scroll

    func scroll(x: Int, y: Int, direction: ScrollDirection, amount: Int = 3) async throws {
        // Move to scroll position
        try await vnc.sendMouseEvent(x: x, y: y, buttonMask: 0)
        cursorX = x
        cursorY = y

        let mask = direction.buttonMask

        for _ in 0..<amount {
            for _ in 0..<timing.scrollEventsPerStep {
                try await vnc.sendMouseEvent(x: x, y: y, buttonMask: mask)
                usleep(timing.scrollEventUs)
                try await vnc.sendMouseEvent(x: x, y: y, buttonMask: 0)
                usleep(timing.scrollEventUs)
            }
            usleep(timing.scrollStepUs)
        }
    }

    // MARK: - Key Press

    func keyTap(_ keysym: UInt32) async throws {
        try await vnc.sendKeyEvent(key: keysym, down: true)
        usleep(timing.keyHoldUs)
        try await vnc.sendKeyEvent(key: keysym, down: false)
    }

    // MARK: - Key Combo (e.g. cmd+space, ctrl+shift+c)

    func keyCombo(_ keysyms: [UInt32]) async throws {
        guard !keysyms.isEmpty else { return }

        // Press all keys in order
        for sym in keysyms {
            try await vnc.sendKeyEvent(key: sym, down: true)
            usleep(timing.comboKeyUs)
        }

        usleep(timing.comboWaitUs)

        // Release in reverse order
        for sym in keysyms.reversed() {
            try await vnc.sendKeyEvent(key: sym, down: false)
            usleep(timing.comboKeyUs)
        }
    }

    /// Parse combo string like "cmd+space" or "ctrl+shift+c" into keysyms and execute.
    func keyCombo(_ combo: String) async throws {
        let parts = combo.lowercased().split(separator: "+").map { String($0).trimmingCharacters(in: .whitespaces) }
        let syms = parts.compactMap { namedKeyToKeysym($0) }
        guard syms.count == parts.count else {
            throw VNCError.sendFailed("Unknown key in combo: \(combo)")
        }
        try await keyCombo(syms)
    }

    // MARK: - Type Text

    func typeText(_ text: String) async throws {
        for ch in text {
            let (keysym, needsShift) = charToKeysym(ch)
            guard keysym != 0 else { continue }

            if needsShift {
                try await vnc.sendKeyEvent(key: KeySym.shiftLeft, down: true)
                usleep(timing.shiftUs)
            }

            try await vnc.sendKeyEvent(key: keysym, down: true)
            usleep(timing.keyHoldUs)
            try await vnc.sendKeyEvent(key: keysym, down: false)

            if needsShift {
                usleep(timing.shiftUs)
                try await vnc.sendKeyEvent(key: KeySym.shiftLeft, down: false)
            }

            // Random delay between characters
            let range = timing.typeMaxUs - timing.typeMinUs
            let randomDelay = timing.typeMinUs + UInt32.random(in: 0...range)
            usleep(randomDelay)
        }
    }

    // MARK: - Paste Text

    func pasteText(_ text: String) async throws {
        // macOS VNC doesn't bridge clipboard — fall back to typing
        // For non-macOS: sendClipboardText + cmd+v / ctrl+v
        try await vnc.sendClipboardText(text)
        usleep(100_000) // 100ms settle
        try await keyCombo("ctrl+v")
    }
}

// MARK: - Scroll Direction

enum ScrollDirection: String {
    case up, down, left, right

    var buttonMask: Int {
        switch self {
        case .up:    return MouseButton.scrollUp.rawValue
        case .down:  return MouseButton.scrollDown.rawValue
        case .left:  return MouseButton.scrollLeft.rawValue
        case .right: return MouseButton.scrollRight.rawValue
        }
    }
}

// MARK: - Key Symbol Constants

enum KeySym {
    static let shiftLeft: UInt32 = 0xFFE1
    static let shiftRight: UInt32 = 0xFFE2
    static let ctrlLeft: UInt32 = 0xFFE3
    static let ctrlRight: UInt32 = 0xFFE4
    static let altLeft: UInt32 = 0xFFE9
    static let altRight: UInt32 = 0xFFEA
    static let metaLeft: UInt32 = 0xFFE7
    static let metaRight: UInt32 = 0xFFE8
    static let superLeft: UInt32 = 0xFFEB
    static let tab: UInt32 = 0xFF09
    static let returnKey: UInt32 = 0xFF0D
    static let escape: UInt32 = 0xFF1B
    static let backspace: UInt32 = 0xFF08
    static let delete: UInt32 = 0xFFFF
    static let home: UInt32 = 0xFF50
    static let end: UInt32 = 0xFF57
    static let pageUp: UInt32 = 0xFF55
    static let pageDown: UInt32 = 0xFF56
    static let arrowLeft: UInt32 = 0xFF51
    static let arrowUp: UInt32 = 0xFF52
    static let arrowRight: UInt32 = 0xFF53
    static let arrowDown: UInt32 = 0xFF54
    static let space: UInt32 = 0x0020
    static let f1: UInt32 = 0xFFBE
    static let f2: UInt32 = 0xFFBF
    static let f3: UInt32 = 0xFFC0
    static let f4: UInt32 = 0xFFC1
    static let f5: UInt32 = 0xFFC2
    static let f6: UInt32 = 0xFFC3
    static let f7: UInt32 = 0xFFC4
    static let f8: UInt32 = 0xFFC5
    static let f9: UInt32 = 0xFFC6
    static let f10: UInt32 = 0xFFC7
    static let f11: UInt32 = 0xFFC8
    static let f12: UInt32 = 0xFFC9
}

// MARK: - Named Key → KeySym Resolution

func namedKeyToKeysym(_ name: String) -> UInt32? {
    switch name {
    // Modifiers
    case "shift", "lshift":      return KeySym.shiftLeft
    case "rshift":               return KeySym.shiftRight
    case "ctrl", "control":      return KeySym.ctrlLeft
    case "rctrl":                return KeySym.ctrlRight
    case "alt", "option":        return KeySym.altLeft
    case "ralt":                 return KeySym.altRight
    case "cmd", "command", "meta", "super": return KeySym.metaLeft
    case "rcmd":                 return KeySym.metaRight
    // Navigation
    case "tab":                  return KeySym.tab
    case "return", "enter":      return KeySym.returnKey
    case "escape", "esc":        return KeySym.escape
    case "backspace":            return KeySym.backspace
    case "delete", "del":        return KeySym.delete
    case "home":                 return KeySym.home
    case "end":                  return KeySym.end
    case "pageup":               return KeySym.pageUp
    case "pagedown":             return KeySym.pageDown
    case "up", "arrowup":        return KeySym.arrowUp
    case "down", "arrowdown":    return KeySym.arrowDown
    case "left", "arrowleft":    return KeySym.arrowLeft
    case "right", "arrowright":  return KeySym.arrowRight
    case "space":                return KeySym.space
    // Function keys
    case "f1":  return KeySym.f1
    case "f2":  return KeySym.f2
    case "f3":  return KeySym.f3
    case "f4":  return KeySym.f4
    case "f5":  return KeySym.f5
    case "f6":  return KeySym.f6
    case "f7":  return KeySym.f7
    case "f8":  return KeySym.f8
    case "f9":  return KeySym.f9
    case "f10": return KeySym.f10
    case "f11": return KeySym.f11
    case "f12": return KeySym.f12
    // Single character fallback
    default:
        if name.count == 1, let ch = name.first {
            return charToKeysym(ch).keysym
        }
        return nil
    }
}

// MARK: - Character → KeySym Resolution

/// Returns (keysym, needsShift) for a character.
func charToKeysym(_ ch: Character) -> (keysym: UInt32, shift: Bool) {
    guard let scalar = ch.unicodeScalars.first else { return (0, false) }
    let code = scalar.value

    // ASCII printable range
    if code >= 0x20 && code <= 0x7E {
        // Uppercase letters need shift
        if ch.isUppercase, let lower = ch.lowercased().first {
            return (UInt32(lower.asciiValue ?? UInt8(code)), true)
        }
        // Shifted symbols
        let shiftedSymbols: [Character: UInt32] = [
            "!": 0x21, "@": 0x40, "#": 0x23, "$": 0x24, "%": 0x25,
            "^": 0x5E, "&": 0x26, "*": 0x2A, "(": 0x28, ")": 0x29,
            "_": 0x5F, "+": 0x2B, "{": 0x7B, "}": 0x7D, "|": 0x7C,
            ":": 0x3A, "\"": 0x22, "<": 0x3C, ">": 0x3E, "?": 0x3F,
            "~": 0x7E,
        ]
        if let sym = shiftedSymbols[ch] {
            return (sym, true)
        }
        // Direct mapping (lowercase letters, numbers, unshifted symbols)
        return (code, false)
    }

    // Non-ASCII — use Unicode keysym (0x01000000 + unicode codepoint)
    if code > 0x7E {
        return (0x01000000 + code, false)
    }

    return (0, false)
}
