import Foundation

struct Command: Decodable {
    let id: String?
    let type: String
    let payload: String?
    let x: Int?
    let y: Int?
    let toX: Int?
    let toY: Int?
    let dx: Int?
    let dy: Int?
    let width: Int?
    let height: Int?
    let button: String?
    let key: String?
    let keys: [String]?
    let text: String?
    let direction: String?
    let amount: Int?
    let ms: Int?
}
