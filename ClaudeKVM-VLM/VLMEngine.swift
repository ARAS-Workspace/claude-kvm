/**
 *  █████╗ ██████╗  █████╗ ███████╗
 * ██╔══██╗██╔══██╗██╔══██╗██╔════╝
 * ███████║██████╔╝███████║███████╗
 * ██╔══██║██╔══██╗██╔══██║╚════██║
 * ██║  ██║██║  ██║██║  ██║███████║
 * ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 *
 * Copyright (c) 2025 Riza Emre ARAS <r.emrearas@proton.me>
 *
 * This file is part of Claude KVM.
 * Released under the MIT License - see LICENSE for details.
 */

import Foundation
import os
import CoreImage
import MLXVLM
import MLXLMCommon

/// Wrapper around MLX VLM for model loading and inference.
final class VLMEngine {
    static let modelId = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"

    var verbose = false

    /// Hub default cache: ~/Library/Caches/models/{org}/{model}
    private static let hubCacheDir = FileManager.default
        .urls(for: .cachesDirectory, in: .userDomainMask).first?
        .appendingPathComponent("models")

    private var container: ModelContainer?

    /// Full path to the model's cache directory.
    var modelCachePath: String? {
        Self.hubCacheDir?.appendingPathComponent(Self.modelId).path
    }

    /// Check if model files exist in Hub's cache directory.
    var isModelCached: Bool {
        guard let path = modelCachePath else { return false }
        return FileManager.default.fileExists(atPath: path)
    }

    /// Ensure model is downloaded and ready. Shows spinner during download.
    func ensureModel() async throws {
        let cached = isModelCached

        if !cached {
            log("Model not found locally, downloading: \(Self.modelId)")
        } else {
            log("Model found in cache")
        }

        let startTime = CFAbsoluteTimeGetCurrent()
        let spinner = DownloadSpinner()

        if !cached {
            spinner.start()
        }

        let tracker = ProgressTracker()
        container = try await VLMModelFactory.shared.loadContainer(
            configuration: .init(id: Self.modelId)
        ) { progress in
            let percent = Int(progress.fractionCompleted * 100)
            guard tracker.update(percent) else { return }
            spinner.update(
                percent: percent,
                completed: progress.completedUnitCount,
                total: progress.totalUnitCount
            )
        }

        spinner.stop()

        let elapsed = String(format: "%.1f", CFAbsoluteTimeGetCurrent() - startTime)
        log(cached ? "Model loaded in \(elapsed)s" : "Model downloaded and loaded in \(elapsed)s")
    }

    /// Run inference on a PNG image data buffer.
    /// - Parameters:
    ///   - imageData: Raw PNG data
    ///   - prompt: Text prompt/question about the image
    ///   - maxTokens: Maximum tokens to generate
    /// - Returns: Generated text response
    func generate(imageData: Data, prompt: String, maxTokens: Int = 1024) async throws -> String {
        guard let container else {
            throw VLMError.modelNotLoaded
        }

        guard let ciImage = CIImage(data: imageData) else {
            throw VLMError.invalidImage
        }

        let input = UserInput(chat: [
            .user(prompt, images: [.ciImage(ciImage)])
        ])

        var output = ""
        var tokenCount = 0

        let stream: AsyncStream<Generation> = try await container.perform { (context: ModelContext) in
            let processedInput = try await context.processor.prepare(input: input)
            return try MLXLMCommon.generate(
                input: processedInput,
                parameters: .init(temperature: 0.1),
                context: context
            )
        }

        for await generation in stream {
            if let chunk = generation.chunk {
                output += chunk
                tokenCount += 1
                if tokenCount >= maxTokens { break }
            }
        }

        return output
    }

    func log(_ message: String) {
        guard verbose else { return }
        FileHandle.standardError.write(Data("[VLM \(timestamp())] \(message)\n".utf8))
    }

    private func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }
}

// MARK: - Download Spinner

/// Interactive spinner that shows download progress on stderr.
private final class DownloadSpinner: @unchecked Sendable {
    private let frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    private var frameIndex = 0
    private var timer: DispatchSourceTimer?
    private var currentMessage = "Downloading model..."
    private let queue = DispatchQueue(label: "vlm.spinner")

    func start() {
        let source = DispatchSource.makeTimerSource(queue: queue)
        source.schedule(deadline: .now(), repeating: .milliseconds(80))
        source.setEventHandler { [weak self] in
            self?.render()
        }
        timer = source
        source.resume()
    }

    func update(percent: Int, completed: Int64, total: Int64) {
        queue.async {
            self.currentMessage = "Downloading: \(percent)% (\(completed)/\(total) files)"
        }
    }

    func stop() {
        timer?.cancel()
        timer = nil
        // Clear the spinner line
        FileHandle.standardError.write(Data("\r\u{1B}[K".utf8))
    }

    private func render() {
        let frame = frames[frameIndex % frames.count]
        frameIndex += 1
        let line = "\r\u{1B}[K\(frame) \(currentMessage)"
        FileHandle.standardError.write(Data(line.utf8))
    }
}

// MARK: - Progress Tracker

/// Thread-safe progress deduplication for Sendable closures.
private final class ProgressTracker: Sendable {
    private let lastPercent = OSAllocatedUnfairLock(initialState: -1)

    /// Returns true if this is a new percent value (deduplicates repeated calls).
    func update(_ percent: Int) -> Bool {
        lastPercent.withLock { last in
            guard percent != last else { return false }
            last = percent
            return true
        }
    }
}

// MARK: - Errors

enum VLMError: LocalizedError {
    case modelNotLoaded
    case invalidImage
    case stdinEmpty

    var errorDescription: String? {
        switch self {
        case .modelNotLoaded: "Model not loaded. Run ensureModel() first."
        case .invalidImage: "Could not decode image from input data."
        case .stdinEmpty: "No image data received from stdin."
        }
    }
}
