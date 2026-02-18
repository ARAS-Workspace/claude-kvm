import Foundation

final class InputController {
    let vnc: VNCBridge
    var timing: InputTiming

    var cursorX: Int = 0
    var cursorY: Int = 0

    init(vnc: VNCBridge, timing: InputTiming = .init()) {
        self.vnc = vnc
        self.timing = timing
    }

    var cursorPosition: (x: Int, y: Int) { (cursorX, cursorY) }
}
