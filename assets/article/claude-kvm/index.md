# Claude KVM

Claude KVM is an MCP tool that controls remote desktop environments over VNC. It consists of a thin JS proxy layer (MCP server) and a platform-native Swift VNC daemon running on your macOS system.

**GitHub:** [ARAS-Workspace/claude-kvm](https://github.com/ARAS-Workspace/claude-kvm)

[![Claude KVM Demo](https://github.com/ARAS-Workspace/claude-kvm/raw/press-kit/assets/article/claude-kvm/assets/demo-linux.png)](https://github.com/ARAS-Workspace/claude-kvm/blob/main/test/README.md)
[![Claude KVM Demo Mac](https://github.com/ARAS-Workspace/claude-kvm/raw/press-kit/assets/article/claude-kvm/assets/demo-mac.png)](https://github.com/ARAS-Workspace/claude-kvm/blob/test/e2e/mac/test/README.md)

## Live Test Runs

- [Integration Test](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22261661594)
- [Mac Integration Test](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22261487249)
- [Mac Calculator Test](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22261139721)
- [Mac Scientific Calculator Test](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22261184519)
- [Mac Safari Browsing Test](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22261430282)

> **Note:**
> Tests are conducted transparently on GitHub Actions — each step is visible in the CI environment. At the end of every test, whether the integration passes or fails, you'll find screenshots of each step the agent took during the session, along with an `.mp4` video recording that captures the entire session. By reviewing these recordings and screenshots, you can observe how the agent progressed through each stage, how long the task took, and what decisions were made based on the system prompt. You can use these examples as a reference when crafting your own system prompts or instructions for the MCP server in your own environment.

> **Warning:**
> Artifacts attached to these runs may have expired due to GitHub's artifact retention policy. Persistent copies are prepared via the [Persist Artifacts](https://github.com/ARAS-Workspace/claude-kvm/actions/workflows/persist-artifacts.yml) workflow and can always be accessed by run ID from the [`artifacts/`](https://github.com/ARAS-Workspace/claude-kvm/tree/press-kit/artifacts) directory on the press-kit branch.

## Architecture

![Architecture](https://github.com/ARAS-Workspace/claude-kvm/raw/press-kit/assets/article/claude-kvm/assets/architecture.png)

### Layers

| Layer          | Language                | Role                                                                 | Communication            |
|----------------|-------------------------|----------------------------------------------------------------------|--------------------------|
| **MCP Proxy**  | JavaScript (Node.js)    | Communicates with Claude over MCP protocol, manages daemon lifecycle | stdio JSON-RPC           |
| **VNC Daemon** | Swift/C (Apple Silicon) | VNC connection, screen capture, mouse/keyboard input injection       | stdin/stdout PC (NDJSON) |

### PC (Procedure Call) Protocol

Communication between the proxy and daemon uses the PC protocol over NDJSON:

```
Request:      {"method":"<name>","params":{...},"id":<int|string>}
Response:     {"result":{...},"id":<int|string>}
Error:        {"error":{"code":<int>,"message":"..."},"id":<int|string>}
Notification: {"method":"<name>","params":{...}}
```

### Coordinate Scaling

The VNC server's native resolution is scaled down to fit within `--max-dimension` (default: 1280px). Claude works more consistently with scaled coordinates — the daemon handles the conversion in the background:

```
Native:  4220 x 2568  (VNC server framebuffer)
Scaled:  1280 x 779   (what Claude sees and targets)

mouse_click(640, 400) → VNC receives (2110, 1284)
```

### Screen Strategy

Claude minimizes token cost with a progressive verification approach:

```
diff_check       →  changeDetected: true/false     ~5ms    (text only, no image)
detect_elements  →  OCR text + bounding boxes      ~50ms   (text only, no image)
cursor_crop      →  crop around cursor              ~50ms   (small image)
screenshot       →  full screen capture             ~200ms  (full image)
```

`detect_elements` uses Apple Vision framework for on-device OCR. Returns text content with bounding box coordinates in scaled space — enables precise click targeting without consuming vision tokens.

---

## Installation

### Requirements

- macOS (Apple Silicon / aarch64)
- Node.js (LTS)

### Daemon

```bash
brew tap ARAS-Workspace/tap
brew install claude-kvm-daemon
```

> **Note:**
> `claude-kvm-daemon` is compiled and code-signed via CI (GitHub Actions). The build output is packaged in two formats: a `.tar.gz` archive for Homebrew distribution and a `.dmg` disk image for notarization. The DMG is submitted to Apple servers for notarization within the same workflow — the process can be tracked from CI logs. The notarized DMG is available as a CI Artifact; the archived `.tar.gz` is also published as a release on the repository. Homebrew installation tracks this release.
>
> - [Release](https://github.com/ARAS-Workspace/claude-kvm/releases/tag/daemon-v1.0.1) · [Source Code](https://github.com/ARAS-Workspace/claude-kvm/tree/daemon-tool)
> - [LibVNC Build](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22122975416) · [LibVNC Branch](https://github.com/ARAS-Workspace/claude-kvm/tree/libvnc-build)
> - [Homebrew Tap](https://github.com/ARAS-Workspace/homebrew-tap)

### MCP Configuration

Create a `.mcp.json` file in your project directory:

```json
{
  "mcpServers": {
    "claude-kvm": {
      "command": "npx",
      "args": ["-y", "claude-kvm"],
      "env": {
        "VNC_HOST": "192.168.1.100",
        "VNC_PORT": "5900",
        "VNC_USERNAME": "user",
        "VNC_PASSWORD": "pass",
        "CLAUDE_KVM_DAEMON_PATH": "/opt/homebrew/bin/claude-kvm-daemon",
        "CLAUDE_KVM_DAEMON_PARAMETERS": "-v"
      }
    }
  }
}
```

> **Note:**
> The tool is end-to-end tested via CI — Claude executes tasks over VNC while an independent vision model observes and verifies the results. See the [Integration Test](https://github.com/ARAS-Workspace/claude-kvm/blob/main/test/README.md) for live workflow runs, system prompts, and demo recordings.

### Configuration

#### MCP Proxy (ENV)

| Parameter                      | Default             | Description                                        |
|--------------------------------|---------------------|----------------------------------------------------|
| `VNC_HOST`                     | `127.0.0.1`         | VNC server address                                 |
| `VNC_PORT`                     | `5900`              | VNC port number                                    |
| `VNC_USERNAME`                 |                     | Username (required for ARD)                        |
| `VNC_PASSWORD`                 |                     | Password                                           |
| `CLAUDE_KVM_DAEMON_PATH`       | `claude-kvm-daemon` | Daemon binary path (not needed if already in PATH) |
| `CLAUDE_KVM_DAEMON_PARAMETERS` |                     | Additional CLI arguments for the daemon            |

#### Daemon Parameters (CLI)

Additional arguments passed to the daemon via `CLAUDE_KVM_DAEMON_PARAMETERS`:

```
"CLAUDE_KVM_DAEMON_PARAMETERS": "--max-dimension 800 -v"
```

| Parameter           | Default | Description                            |
|---------------------|---------|----------------------------------------|
| `--max-dimension`   | `1280`  | Maximum display scaling dimension (px) |
| `--connect-timeout` |         | VNC connection timeout (seconds)       |
| `--bits-per-sample` |         | Bits per pixel sample                  |
| `--no-reconnect`    |         | Disable automatic reconnection         |
| `-v, --verbose`     |         | Verbose logging (stderr)               |

#### Runtime Configuration (PC)

All timing and display parameters are configurable at runtime via the `configure` method. Use `get_timing` to inspect current values.

Set timing:
```json
{"method":"configure","params":{"click_hold_ms":80,"key_hold_ms":50}}
```
```json
{"result":{"detail":"OK — changed: click_hold_ms, key_hold_ms"}}
```

Change display scaling:
```json
{"method":"configure","params":{"max_dimension":960}}
```
```json
{"result":{"detail":"OK — changed: max_dimension","scaledWidth":960,"scaledHeight":584}}
```

Reset to defaults:
```json
{"method":"configure","params":{"reset":true}}
```
```json
{"result":{"detail":"OK — reset to defaults","timing":{"click_hold_ms":50,"combo_mod_ms":10,"cursor_crop_radius":150,"double_click_gap_ms":50,"drag_min_steps":10,"drag_pixels_per_step":20,"drag_position_ms":30,"drag_press_ms":50,"drag_settle_ms":30,"drag_step_ms":5,"hover_settle_ms":400,"key_hold_ms":30,"max_dimension":1280,"paste_settle_ms":30,"scroll_press_ms":10,"scroll_tick_ms":20,"type_inter_key_ms":20,"type_key_ms":20,"type_shift_ms":10},"scaledWidth":1280,"scaledHeight":779}}
```

Get current values:
```json
{"method":"get_timing"}
```
```json
{"result":{"timing":{"click_hold_ms":80,"combo_mod_ms":10,"cursor_crop_radius":150,"double_click_gap_ms":50,"drag_min_steps":10,"drag_pixels_per_step":20,"drag_position_ms":30,"drag_press_ms":50,"drag_settle_ms":30,"drag_step_ms":5,"hover_settle_ms":400,"key_hold_ms":50,"max_dimension":1280,"paste_settle_ms":30,"scroll_press_ms":10,"scroll_tick_ms":20,"type_inter_key_ms":20,"type_key_ms":20,"type_shift_ms":10},"scaledWidth":1280,"scaledHeight":779}}
```

| Parameter              | Default | Description                |
|------------------------|---------|----------------------------|
| `max_dimension`        | `1280`  | Max screenshot dimension   |
| `cursor_crop_radius`   | `150`   | Cursor crop radius (px)    |
| `click_hold_ms`        | `50`    | Click hold duration        |
| `double_click_gap_ms`  | `50`    | Double-click gap delay     |
| `hover_settle_ms`      | `400`   | Hover settle wait          |
| `drag_position_ms`     | `30`    | Pre-drag position wait     |
| `drag_press_ms`        | `50`    | Drag press hold threshold  |
| `drag_step_ms`         | `5`     | Between interpolation pts  |
| `drag_settle_ms`       | `30`    | Settle before release      |
| `drag_pixels_per_step` | `20`    | Point density per pixel    |
| `drag_min_steps`       | `10`    | Min interpolation steps    |
| `scroll_press_ms`      | `10`    | Scroll press-release gap   |
| `scroll_tick_ms`       | `20`    | Inter-tick delay           |
| `key_hold_ms`          | `30`    | Key hold duration          |
| `combo_mod_ms`         | `10`    | Modifier settle delay      |
| `type_key_ms`          | `20`    | Key hold during typing     |
| `type_inter_key_ms`    | `20`    | Inter-character delay      |
| `type_shift_ms`        | `10`    | Shift key settle           |
| `paste_settle_ms`      | `30`    | Post-clipboard write wait  |

---

## Tools

All operations are performed through a single `vnc_command` tool:

### Screen

| Action         | Parameters | Description                                |
|----------------|------------|--------------------------------------------|
| `screenshot`   |            | Full screen PNG capture                    |
| `cursor_crop`  |            | Crop around cursor with crosshair overlay  |
| `diff_check`   |            | Detect screen changes against baseline     |
| `set_baseline` |            | Save current screen as diff reference      |

### Mouse

| Action               | Parameters                 | Description                    |
|----------------------|----------------------------|--------------------------------|
| `mouse_click`        | `x, y, button?`            | Click (left\|right\|middle)    |
| `mouse_double_click` | `x, y`                     | Double click                   |
| `mouse_move`         | `x, y`                     | Move cursor                    |
| `hover`              | `x, y`                     | Move + settle wait             |
| `nudge`              | `dx, dy`                   | Relative cursor movement       |
| `mouse_drag`         | `x, y, toX, toY`           | Drag from start to end         |
| `scroll`             | `x, y, direction, amount?` | Scroll (up\|down\|left\|right) |

### Keyboard

| Action      | Parameters        | Description                                                  |
|-------------|-------------------|--------------------------------------------------------------|
| `key_tap`   | `key`             | Single key press (enter\|escape\|tab\|space\|...)            |
| `key_combo` | `key` or `keys`   | Modifier combo ("cmd+c" or ["cmd","shift","3"])              |
| `key_type`  | `text`            | Type text character by character                             |
| `paste`     | `text`            | Paste text via clipboard                                     |

### Detection

| Action            | Parameters | Description                                           |
|-------------------|------------|-------------------------------------------------------|
| `detect_elements` |            | OCR text detection with bounding boxes (Apple Vision) |

Returns text elements with bounding box coordinates in scaled space:

```json
{"method":"detect_elements"}
```
```json
{"result":{"detail":"13 elements","elements":[{"confidence":1,"h":9,"text":"Finder","w":32,"x":37,"y":6},{"confidence":1,"h":9,"text":"File","w":15,"x":84,"y":6},{"confidence":1,"h":9,"text":"Edit","w":19,"x":112,"y":6},{"confidence":1,"h":9,"text":"View","w":22,"x":143,"y":6},{"confidence":1,"h":11,"text":"Go","w":15,"x":179,"y":6},{"confidence":1,"h":9,"text":"Window","w":35,"x":207,"y":6},{"confidence":1,"h":11,"text":"Help","w":22,"x":255,"y":6},{"confidence":1,"h":11,"text":"8•","w":26,"x":1161,"y":6},{"confidence":1,"h":9,"text":"Fri Feb 20 22:19","w":80,"x":1189,"y":6},{"confidence":1,"h":9,"text":"Assets","w":32,"x":1202,"y":97},{"confidence":1,"h":9,"text":"Passwords.kdbx","w":74,"x":1181,"y":168},{"confidence":1,"h":93,"text":"PHANTOM","w":633,"x":322,"y":477},{"confidence":1,"h":32,"text":"YOUR SERVER, YOUR NETWORK, YOUR PRIVACY","w":629,"x":325,"y":568}],"scaledHeight":717,"scaledWidth":1280}}
```

### Configuration

| Action       | Parameters      | Description                          |
|--------------|-----------------|--------------------------------------|
| `configure`  | `{<params>}`    | Set timing/display params at runtime |
| `configure`  | `{reset: true}` | Reset all params to defaults         |
| `get_timing` |                 | Get current timing + display params  |

### Control

| Action     | Parameters | Description                       |
|------------|------------|-----------------------------------|
| `wait`     | `ms?`      | Wait (default 500ms)              |
| `health`   |            | Connection status + display info  |
| `shutdown` |            | Graceful daemon shutdown          |

---

## Authentication

Supported VNC authentication methods:

- **VNC Auth** — password-based challenge-response (DES)
- **ARD** — Apple Remote Desktop (Diffie-Hellman + AES-128-ECB)

macOS is auto-detected via the ARD auth type 30 credential request. When detected, Meta keys are remapped to Super (Command key compatibility).

---

[View this document on GitHub](https://github.com/ARAS-Workspace/claude-kvm/blob/main/README.md)

Copyright (c) 2026 Riza Emre ARAS — MIT License