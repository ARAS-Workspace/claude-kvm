import Foundation

/// Detected text element from OCR with bounding box in scaled coordinates.
struct TextElement: Encodable {
    let text: String
    let elX: Int
    let elY: Int
    let elW: Int
    let elH: Int
    let confidence: Double

    enum CodingKeys: String, CodingKey {
        case text
        case elX = "x"
        case elY = "y"
        case elW = "w"
        case elH = "h"
        case confidence
    }
}

/// PC (Procedure Call) response over stdout NDJSON.
/// {"result":{"detail":"OK"},"id":1}
struct PCResponse: Encodable {
    let result: ResultPayload?
    let error: ErrorPayload?
    let id: PCId?

    struct ResultPayload: Encodable {
        var detail: String?
        var image: String?
        var x: Int?
        var y: Int?
        var scaledWidth: Int?
        var scaledHeight: Int?
        var timing: [String: Double]?
        var elements: [TextElement]?
    }

    struct ErrorPayload: Encodable {
        var code: Int
        var message: String
    }

    static func success(
        id: PCId?,
        detail: String? = nil,
        image: String? = nil,
        x: Int? = nil,
        y: Int? = nil,
        scaledWidth: Int? = nil,
        scaledHeight: Int? = nil,
        timing: [String: Double]? = nil,
        elements: [TextElement]? = nil
    ) -> PCResponse {
        PCResponse(
            result: ResultPayload(
                detail: detail, image: image, x: x, y: y,
                scaledWidth: scaledWidth, scaledHeight: scaledHeight,
                timing: timing, elements: elements
            ),
            error: nil, id: id
        )
    }

    static func error(id: PCId?, code: Int = -32000, message: String) -> PCResponse {
        PCResponse(result: nil, error: ErrorPayload(code: code, message: message), id: id)
    }
}

/// PC (Procedure Call) notification — no id, server->caller.
/// {"method":"vnc_state","params":{"state":"connected"}}
struct PCNotification: Encodable {
    let method: String
    let params: [String: PCValue]?
}

/// PC value type for notification params.
enum PCValue: Encodable {
    case string(String)
    case int(Int)
    case bool(Bool)

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .int(let n): try container.encode(n)
        case .bool(let b): try container.encode(b)
        }
    }
}
