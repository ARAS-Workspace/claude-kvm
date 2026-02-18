import Foundation
import CoreGraphics
import AppKit

extension ClaudeKVMDaemon {

    // MARK: - Diff State

    static var baselineBuffer: Data?
    static let diffThreshold: UInt8 = 30
    static var maxImageDimension = 1280

    // MARK: - Diff Check

    func diffCheck(buffer: UnsafeRawBufferPointer) -> Bool {
        guard let baseline = Self.baselineBuffer else {
            Self.baselineBuffer = Data(buffer)
            return false
        }

        let threshold = Self.diffThreshold
        let count = min(baseline.count, buffer.count)

        var changed = false
        baseline.withUnsafeBytes { basePtr in
            let base = basePtr.bindMemory(to: UInt8.self)
            let current = buffer.bindMemory(to: UInt8.self)
            for i in stride(from: 0, to: count, by: 4) {
                if abs(Int(base[i]) - Int(current[i])) > Int(threshold) ||
                   abs(Int(base[i+1]) - Int(current[i+1])) > Int(threshold) ||
                   abs(Int(base[i+2]) - Int(current[i+2])) > Int(threshold) {
                    changed = true
                    return
                }
            }
        }

        Self.baselineBuffer = Data(buffer)
        return changed
    }

    // MARK: - Cursor Crop with Crosshair

    func cropWithCrosshair(
        buffer: UnsafeRawBufferPointer,
        width: Int, height: Int,
        centerX: Int, centerY: Int, radius: Int
    ) -> Data? {
        let left = max(0, centerX - radius)
        let top = max(0, centerY - radius)
        let right = min(width, centerX + radius)
        let bottom = min(height, centerY + radius)
        let cropW = right - left
        let cropH = bottom - top
        guard cropW > 0, cropH > 0 else { return nil }

        var cropData = [UInt8](repeating: 0, count: cropW * cropH * 4)
        let src = buffer.bindMemory(to: UInt8.self)
        for row in 0..<cropH {
            let srcOffset = ((top + row) * width + left) * 4
            let dstOffset = row * cropW * 4
            let rowBytes = cropW * 4
            for col in 0..<rowBytes {
                cropData[dstOffset + col] = src[srcOffset + col]
            }
        }

        let cx = centerX - left
        let cy = centerY - top
        let crossSize = 12
        for i in -crossSize...crossSize {
            let hx = cx + i
            if hx >= 0, hx < cropW {
                let off = (cy * cropW + hx) * 4
                cropData[off] = 255; cropData[off+1] = 0; cropData[off+2] = 0; cropData[off+3] = 255
            }
            let vy = cy + i
            if vy >= 0, vy < cropH {
                let off = (vy * cropW + cx) * 4
                cropData[off] = 255; cropData[off+1] = 0; cropData[off+2] = 0; cropData[off+3] = 255
            }
        }

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return cropData.withUnsafeMutableBytes { rawPtr -> Data? in
            guard let ctx = CGContext(
                data: rawPtr.baseAddress,
                width: cropW, height: cropH,
                bitsPerComponent: 8, bytesPerRow: cropW * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ), let cgImage = ctx.makeImage() else { return nil }
            let rep = NSBitmapImageRep(cgImage: cgImage)
            return rep.representation(using: .png, properties: [:])
        }
    }

    // MARK: - Crop Region to PNG

    func cropRegionToPNG(
        buffer: UnsafeRawBufferPointer,
        fbWidth: Int, fbHeight: Int,
        x: Int, y: Int, width cropW: Int, height cropH: Int
    ) -> Data? {
        let clampedX = max(0, min(x, fbWidth))
        let clampedY = max(0, min(y, fbHeight))
        let clampedW = min(cropW, fbWidth - clampedX)
        let clampedH = min(cropH, fbHeight - clampedY)
        guard clampedW > 0, clampedH > 0 else { return nil }

        var cropData = [UInt8](repeating: 0, count: clampedW * clampedH * 4)
        let src = buffer.bindMemory(to: UInt8.self)
        for row in 0..<clampedH {
            let srcOffset = ((clampedY + row) * fbWidth + clampedX) * 4
            let dstOffset = row * clampedW * 4
            let rowBytes = clampedW * 4
            for col in 0..<rowBytes {
                cropData[dstOffset + col] = src[srcOffset + col]
            }
        }

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return cropData.withUnsafeMutableBytes { rawPtr -> Data? in
            guard let ctx = CGContext(
                data: rawPtr.baseAddress,
                width: clampedW, height: clampedH,
                bitsPerComponent: 8, bytesPerRow: clampedW * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ), let cgImage = ctx.makeImage() else { return nil }
            let rep = NSBitmapImageRep(cgImage: cgImage)
            return rep.representation(using: .png, properties: [:])
        }
    }

    // MARK: - PNG Encoding

    func createPNGFromRGBA(
        buffer: UnsafeRawBufferPointer,
        width: Int,
        height: Int
    ) -> Data? {
        guard let baseAddress = buffer.baseAddress else { return nil }
        let bytesPerRow = width * 4

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                  data: UnsafeMutableRawPointer(mutating: baseAddress),
                  width: width,
                  height: height,
                  bitsPerComponent: 8,
                  bytesPerRow: bytesPerRow,
                  space: colorSpace,
                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
              ),
              let cgImage = context.makeImage() else {
            return nil
        }

        let maxDim = Self.maxImageDimension
        let finalImage: CGImage
        if width > maxDim || height > maxDim {
            let scale = Double(maxDim) / Double(max(width, height))
            let newW = Int(Double(width) * scale)
            let newH = Int(Double(height) * scale)

            guard let scaleCtx = CGContext(
                data: nil,
                width: newW,
                height: newH,
                bitsPerComponent: 8,
                bytesPerRow: newW * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ) else { return nil }

            scaleCtx.interpolationQuality = .high
            scaleCtx.draw(cgImage, in: CGRect(x: 0, y: 0, width: newW, height: newH))

            guard let scaled = scaleCtx.makeImage() else { return nil }
            finalImage = scaled
        } else {
            finalImage = cgImage
        }

        let rep = NSBitmapImageRep(cgImage: finalImage)
        return rep.representation(using: .png, properties: [:])
    }
}
