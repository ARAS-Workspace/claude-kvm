import Foundation

/// PC (Procedure Call) request over stdin NDJSON.
/// {"method":"mouse_click","params":{"x":640,"y":480},"id":1}
struct PCRequest: Decodable {
    let method: String
    let params: Params?
    let id: PCId?

    struct Params: Decodable {
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
