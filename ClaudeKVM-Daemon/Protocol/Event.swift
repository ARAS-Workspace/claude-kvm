import Foundation

struct Event: Encodable {
    var id: String?
    var type: String
    var success: Bool?
    var state: String?
    var detail: String?
    var image: String?
    var x: Int?
    var y: Int?
    var scaledWidth: Int?
    var scaledHeight: Int?
}
