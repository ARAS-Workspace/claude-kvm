import Foundation

struct DisplayScaling {
    let nativeWidth: Int
    let nativeHeight: Int
    let scaledWidth: Int
    let scaledHeight: Int

    init(nativeWidth: Int, nativeHeight: Int, maxDimension: Int = 1280) {
        self.nativeWidth = nativeWidth
        self.nativeHeight = nativeHeight
        let ratio = min(
            Double(maxDimension) / Double(nativeWidth),
            Double(maxDimension) / Double(nativeHeight),
            1.0
        )
        self.scaledWidth = Int((Double(nativeWidth) * ratio).rounded())
        self.scaledHeight = Int((Double(nativeHeight) * ratio).rounded())
    }

    func toNative(x: Int, y: Int) -> (x: Int, y: Int) {
        let sx = Double(nativeWidth) / Double(scaledWidth)
        let sy = Double(nativeHeight) / Double(scaledHeight)
        return (x: Int((Double(x) * sx).rounded()), y: Int((Double(y) * sy).rounded()))
    }

    func toScaled(x: Int, y: Int) -> (x: Int, y: Int) {
        let sx = Double(scaledWidth) / Double(nativeWidth)
        let sy = Double(scaledHeight) / Double(nativeHeight)
        return (x: Int((Double(x) * sx).rounded()), y: Int((Double(y) * sy).rounded()))
    }
}
