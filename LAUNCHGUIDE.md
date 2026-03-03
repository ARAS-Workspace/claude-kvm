# Claude KVM

## Tagline
Control remote desktops over VNC with native OCR — no cloud vision APIs needed.

## Description
Claude KVM is an MCP server that gives AI agents full control over remote desktop environments via VNC. It pairs a lightweight Node.js proxy with a native Swift daemon that handles screen capture, keyboard/mouse input, and on-device text detection using Apple Vision OCR. The daemon connects to any standard VNC server and translates MCP tool calls into RFB protocol actions — click, type, scroll, drag, screenshot, and element detection — all running locally on macOS with zero external API costs for vision tasks.

## Setup Requirements
- `VNC_HOST` (required): Hostname or IP of the VNC server to connect to.
- `VNC_PORT` (required): Port number of the VNC server (typically 5900).
- `VNC_PASSWORD` (optional): VNC or Apple Remote Desktop password. Required if the VNC server uses authentication.
- `VNC_USERNAME` (optional): Username for Apple Remote Desktop (ARD) authentication.
- `CLAUDE_KVM_DAEMON_PATH` (required): Path to the `claude-kvm-daemon` binary. Install via Homebrew: `brew install ARAS-Workspace/tap/claude-kvm-daemon`

## Category
Developer Tools

## Use Cases
Remote Desktop Automation, GUI Testing, CI/CD Visual Testing, Screen Scraping, macOS Remote Control, Accessibility Automation, Desktop Agent Orchestration

## Features
- Full VNC desktop control — mouse clicks, double-clicks, dragging, scrolling, keyboard input, and clipboard paste
- On-device OCR via Apple Vision — detect all text elements with bounding boxes, zero API cost, ~50ms
- Screenshot and visual diff — capture full screen, crop around cursor, or detect changes since baseline
- Action queue — batch up to 20 sequential actions in a single tool call for efficient multi-step workflows
- Native Swift daemon — platform-optimized performance on Apple Silicon with static-linked LibVNC
- Runtime configuration — adjust timing parameters, display scaling, and behavior without reconnecting
- Apple Remote Desktop support — ARD authentication (type 30), Meta-to-Super key remapping for macOS targets
- Coordinate scaling — automatic mapping between scaled display space and native framebuffer resolution
- CI/CD integration — tested end-to-end on GitHub Actions with screen recording and step-by-step screenshots

## Getting Started
- "Take a screenshot and describe what you see on the remote desktop"
- "Open the Applications folder and launch Calculator"
- "Use detect_elements to find all text on screen, then click the Submit button"
- Tool: vnc_command — Control the remote desktop: screenshot, click, type, scroll, OCR detection, and more
- Tool: action_queue — Batch multiple actions (up to 20) in a single call for efficient automation

## Tags
mcp, vnc, kvm, remote-desktop, automation, ocr, apple-vision, macos, apple-silicon, native, gui-testing, screen-capture, desktop-control, ci-cd, swift, libvnc, rfb-protocol, clipboard, keyboard, mouse

## Documentation URL
https://github.com/ARAS-Workspace/claude-kvm

## Health Check URL