import Foundation

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
        scaledHeight: Int? = nil
    ) -> PCResponse {
        PCResponse(
            result: ResultPayload(
                detail: detail, image: image, x: x, y: y,
                scaledWidth: scaledWidth, scaledHeight: scaledHeight
            ),
            error: nil, id: id
        )
    }

    static func error(id: PCId?, code: Int = -32000, message: String) -> PCResponse {
        PCResponse(result: nil, error: ErrorPayload(code: code, message: message), id: id)
    }
}

/// PC (Procedure Call) notification — no id, server→caller.
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
