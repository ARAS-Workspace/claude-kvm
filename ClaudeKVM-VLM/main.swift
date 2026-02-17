import Foundation
import ArgumentParser

@main
struct ClaudeKVMVLM: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "claude-kvm-vlm",
        abstract: "On-device VLM inference for Claude KVM (Apple Silicon)",
        discussion: """
             █████╗ ██████╗  █████╗ ███████╗
            ██╔══██╗██╔══██╗██╔══██╗██╔════╝
            ███████║██████╔╝███████║███████╗
            ██╔══██║██╔══██╗██╔══██║╚════██║
            ██║  ██║██║  ██║██║  ██║███████║
            ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝

            Copyright (c) 2025 Riza Emre ARAS <r.emrearas@proton.me>
            Released under the MIT License - see LICENSE for details.

            Runs Apple FastVLM on-device for image analysis. Reads a PNG image from \
            stdin and outputs the model's text response to stdout.

            MODES:
              Setup     Run without --prompt to download/verify the model.
              Inference Pipe an image via stdin with --prompt to analyze it.

            EXAMPLES:
              Download model:
                claude-kvm-vlm

              Analyze a screenshot:
                cat screenshot.png | claude-kvm-vlm --prompt "What do you see?"

              Verbose output:
                cat image.png | claude-kvm-vlm --prompt "Describe" -v

            OUTPUT:
              stdout  Plain text result (inference) or status lines (setup).
              stderr  Spinner progress, errors ([ERROR] prefix), or verbose logs (-v).
              exit 0  Success.
              exit 1  Failure (error details on stderr).
            """
    )

    @Option(name: .long, help: "Text prompt/question about the image. Omit for setup mode.")
    var prompt: String?

    @Option(name: .long, help: "Maximum tokens to generate (default: 1024).")
    var maxTokens: Int = 1024

    @Flag(name: [.short, .long], help: "Enable verbose logging to stderr.")
    var verbose: Bool = false

    func run() async throws {
        let engine = VLMEngine()
        engine.verbose = verbose

        guard let prompt else {
            try await runSetup(engine)
            return
        }

        try await runInference(engine, prompt: prompt)
    }

    private func runSetup(_ engine: VLMEngine) async throws {
        engine.log("Setup mode: ensuring model is ready")
        engine.log("Model: \(VLMEngine.modelId)")

        do {
            try await engine.ensureModel()
        } catch {
            printError("Model setup failed: \(error.localizedDescription)")
            throw ExitCode.failure
        }

        let cachePath = engine.modelCachePath ?? "unknown"
        engine.log("Cache directory: \(cachePath)")

        let toolPath = ProcessInfo.processInfo.arguments.first ?? "claude-kvm-vlm"
        let resolvedPath = URL(fileURLWithPath: toolPath).standardizedFileURL.path

        print("[READY] \(VLMEngine.modelId)")
        print("[CACHE] \(cachePath)")
        print("[PATH]  \(resolvedPath)")
        print("")
        print("Add to your .mcp.json:")
        print("  \"CLAUDE_KVM_VLM_TOOL_PATH\": \"\(resolvedPath)\"")
    }

    private func runInference(_ engine: VLMEngine, prompt: String) async throws {
        engine.log("Using model: \(VLMEngine.modelId)")

        let spinner = InferenceSpinner()
        spinner.start("Loading model...")

        do {
            try await engine.ensureModel()
        } catch {
            spinner.stop()
            printError("Model setup failed: \(error.localizedDescription)")
            throw ExitCode.failure
        }

        let imageData = FileHandle.standardInput.readDataToEndOfFile()
        guard !imageData.isEmpty else {
            spinner.stop()
            printError("No image data received from stdin")
            throw ExitCode.failure
        }
        engine.log("Received \(imageData.count) bytes from stdin")

        spinner.update("Running inference...")
        let startTime = CFAbsoluteTimeGetCurrent()

        let result: String
        do {
            result = try await engine.generate(
                imageData: imageData, prompt: prompt, maxTokens: maxTokens
            )
        } catch {
            spinner.stop()
            printError("Inference failed: \(error.localizedDescription)")
            throw ExitCode.failure
        }

        spinner.stop()

        let elapsed = String(format: "%.1f", CFAbsoluteTimeGetCurrent() - startTime)
        engine.log("Inference completed in \(elapsed)s (\(result.count) chars)")

        print(result)
    }

    private func printError(_ message: String) {
        FileHandle.standardError.write(Data("[ERROR] \(message)\n".utf8))
    }
}

// MARK: - Inference Spinner

private final class InferenceSpinner: @unchecked Sendable {
    private let frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    private var frameIndex = 0
    private var timer: DispatchSourceTimer?
    private var currentMessage = ""
    private let queue = DispatchQueue(label: "vlm.inference-spinner")

    func start(_ message: String) {
        currentMessage = message
        let source = DispatchSource.makeTimerSource(queue: queue)
        source.schedule(deadline: .now(), repeating: .milliseconds(80))
        source.setEventHandler { [weak self] in
            self?.render()
        }
        timer = source
        source.resume()
    }

    func update(_ message: String) {
        queue.async {
            self.currentMessage = message
        }
    }

    func stop() {
        timer?.cancel()
        timer = nil
        FileHandle.standardError.write(Data("\r\u{1B}[K".utf8))
    }

    private func render() {
        let frame = frames[frameIndex % frames.count]
        frameIndex += 1
        let line = "\r\u{1B}[K\(frame) \(currentMessage)"
        FileHandle.standardError.write(Data(line.utf8))
    }
}
