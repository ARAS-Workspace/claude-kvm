import Foundation

/// Emits independent observation events (cursor, frame, clipboard) on stdout NDJSON.
/// Decoupled from command-response cycle. No IDs — pure async event stream.
final class ObserverStream {
    private let emit: (Event) -> Void
    private let scaling: DisplayScaling

    /// frame_changed debounce: suppress duplicate events within this window.
    private let frameDebounceUs: UInt64 = 100_000 // 100ms
    private var lastFrameEmitTime: UInt64 = 0
    private let lock = NSLock()

    init(scaling: DisplayScaling, emit: @escaping (Event) -> Void) {
        self.scaling = scaling
        self.emit = emit
    }

    // MARK: - Cursor Position (from HandleCursorPos callback)

    func cursorMoved(x: Int, y: Int) {
        let pos = scaling.toScaled(x: x, y: y)
        emit(Event(type: "cursor_pos", x: pos.x, y: pos.y))
    }

    // MARK: - Frame Changed (from FinishedFrameBufferUpdate callback, debounced)

    func frameChanged() {
        let now = mach_absolute_time()
        lock.lock()
        let elapsed = now - lastFrameEmitTime
        // Convert to ~microseconds (approximate, good enough for debounce)
        let elapsedUs = elapsed / 1000
        guard elapsedUs >= frameDebounceUs else {
            lock.unlock()
            return
        }
        lastFrameEmitTime = now
        lock.unlock()

        emit(Event(type: "frame_changed"))
    }

    // MARK: - Clipboard (from GotXCutText callback)

    func clipboardReceived(_ text: String) {
        emit(Event(type: "clipboard", detail: text))
    }
}
