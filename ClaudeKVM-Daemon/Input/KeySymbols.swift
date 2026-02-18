import Foundation

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

// MARK: - Timing (deterministic, zero randomness)

struct InputTiming {
    // Mouse
    var clickHoldUs: UInt32     = 50_000   // 50ms
    var doubleClickGapUs: UInt32 = 50_000  // 50ms
    var hoverSettleUs: UInt32   = 400_000  // 400ms

    // Drag
    var dragPositionUs: UInt32  = 30_000   // 30ms
    var dragPressUs: UInt32     = 50_000   // 50ms
    var dragStepUs: UInt32      = 5_000    // 5ms
    var dragSettleUs: UInt32    = 30_000   // 30ms
    var dragPixelsPerStep: Double = 20.0   // 20px
    var dragMinSteps: Int       = 10

    // Scroll
    var scrollPressUs: UInt32   = 10_000   // 10ms
    var scrollTickUs: UInt32    = 20_000   // 20ms

    // Keyboard
    var keyHoldUs: UInt32       = 30_000   // 30ms
    var comboModUs: UInt32      = 10_000   // 10ms

    // Typing
    var typeKeyUs: UInt32       = 20_000   // 20ms
    var typeInterKeyUs: UInt32  = 20_000   // 20ms
    var typeShiftUs: UInt32     = 10_000   // 10ms
    var pasteSettleUs: UInt32   = 30_000   // 30ms

    // Display
    var cursorCropRadius: Int   = 150      // px
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
    static let superRight: UInt32 = 0xFFEC
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
    static let insert: UInt32 = 0xFF63
    static let capsLock: UInt32 = 0xFFE5
    static let numLock: UInt32 = 0xFF7F
    static let scrollLock: UInt32 = 0xFF14
    static let printScreen: UInt32 = 0xFF61
    static let pause: UInt32 = 0xFF13
    static let menu: UInt32 = 0xFF67
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
    case "shift", "lshift":      return KeySym.shiftLeft
    case "rshift":               return KeySym.shiftRight
    case "ctrl", "control":      return KeySym.ctrlLeft
    case "rctrl":                return KeySym.ctrlRight
    case "alt", "option", "opt": return KeySym.altLeft
    case "ralt":                 return KeySym.altRight
    case "cmd", "command", "meta", "super": return KeySym.metaLeft
    case "rcmd":                 return KeySym.metaRight
    case "tab":                  return KeySym.tab
    case "return", "enter", "ret": return KeySym.returnKey
    case "escape", "esc":        return KeySym.escape
    case "backspace":            return KeySym.backspace
    case "delete", "del":        return KeySym.delete
    case "home":                 return KeySym.home
    case "end":                  return KeySym.end
    case "pageup", "pgup":       return KeySym.pageUp
    case "pagedown", "pgdn", "pgdown": return KeySym.pageDown
    case "up", "arrowup":        return KeySym.arrowUp
    case "down", "arrowdown":    return KeySym.arrowDown
    case "left", "arrowleft":    return KeySym.arrowLeft
    case "right", "arrowright":  return KeySym.arrowRight
    case "space", "spc":         return KeySym.space
    case "ins", "insert":        return KeySym.insert
    case "capslock", "caps":     return KeySym.capsLock
    case "numlock":              return KeySym.numLock
    case "scrolllock":           return KeySym.scrollLock
    case "printscreen", "print", "prtsc": return KeySym.printScreen
    case "pause", "break":       return KeySym.pause
    case "menu", "contextmenu":  return KeySym.menu
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
    default:
        if name.count == 1, let ch = name.first {
            return charToKeysym(ch).keysym
        }
        return nil
    }
}

// MARK: - Character → KeySym Resolution

func charToKeysym(_ ch: Character) -> (keysym: UInt32, shift: Bool) {
    guard let scalar = ch.unicodeScalars.first else { return (0, false) }
    let code = scalar.value

    if code >= 0x20 && code <= 0x7E {
        if ch.isUppercase, let lower = ch.lowercased().first {
            return (UInt32(lower.asciiValue ?? UInt8(code)), true)
        }
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
        return (code, false)
    }

    if code > 0x7E {
        return (0x01000000 + code, false)
    }

    return (0, false)
}
