import Foundation

/// PC (Procedure Call) request over stdin NDJSON.
/// {"method":"mouse_click","params":{"x":640,"y":480},"id":1}
struct PCRequest: Decodable {
    let method: String
    let params: Params?
    let id: PCId?

    struct Params: Decodable {
        // Action parameters
        let x: Int?
        let y: Int?
        let toX: Int?
        let toY: Int?
        let dx: Int?
        let dy: Int?
        let button: String?
        let key: String?
        let keys: [String]?
        let text: String?
        let direction: String?
        let amount: Int?
        let ms: Int?

        // Configure — timing (ms) + display
        let reset: Bool?
        let maxDimension: Int?
        let clickHoldMs: Int?
        let doubleClickGapMs: Int?
        let hoverSettleMs: Int?
        let dragPositionMs: Int?
        let dragPressMs: Int?
        let dragStepMs: Int?
        let dragSettleMs: Int?
        let dragPixelsPerStep: Double?
        let dragMinSteps: Int?
        let scrollPressMs: Int?
        let scrollTickMs: Int?
        let keyHoldMs: Int?
        let comboModMs: Int?
        let typeKeyMs: Int?
        let typeInterKeyMs: Int?
        let typeShiftMs: Int?
        let pasteSettleMs: Int?
        let cursorCropRadius: Int?

        // swiftlint:disable nesting
        enum CodingKeys: String, CodingKey {
            case x, y, toX, toY, dx, dy
            case button, key, keys, text, direction, amount, ms
            case reset
            case maxDimension = "max_dimension"
            case clickHoldMs = "click_hold_ms"
            case doubleClickGapMs = "double_click_gap_ms"
            case hoverSettleMs = "hover_settle_ms"
            case dragPositionMs = "drag_position_ms"
            case dragPressMs = "drag_press_ms"
            case dragStepMs = "drag_step_ms"
            case dragSettleMs = "drag_settle_ms"
            case dragPixelsPerStep = "drag_pixels_per_step"
            case dragMinSteps = "drag_min_steps"
            case scrollPressMs = "scroll_press_ms"
            case scrollTickMs = "scroll_tick_ms"
            case keyHoldMs = "key_hold_ms"
            case comboModMs = "combo_mod_ms"
            case typeKeyMs = "type_key_ms"
            case typeInterKeyMs = "type_inter_key_ms"
            case typeShiftMs = "type_shift_ms"
            case pasteSettleMs = "paste_settle_ms"
            case cursorCropRadius = "cursor_crop_radius"
        }
        // swiftlint:enable nesting
    }
}

/// PC identifier — string or number, used to correlate request/response pairs.
enum PCId: Codable, Equatable {
    case string(String)
    case number(Int)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) {
            self = .string(s)
        } else if let n = try? container.decode(Int.self) {
            self = .number(n)
        } else {
            throw DecodingError.typeMismatch(PCId.self, .init(codingPath: [], debugDescription: "Expected string or int"))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .number(let n): try container.encode(n)
        }
    }
}
