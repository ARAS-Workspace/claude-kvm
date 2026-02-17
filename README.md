# Claude KVM

Claude KVM is an MCP tool that controls your remote desktop environment over VNC.

## Usage

Create a `.mcp.json` file in your project root directory:

```json
{
  "mcpServers": {
    "claude-kvm": {
      "command": "npx",
      "args": ["-y", "claude-kvm"],
      "env": {
        "VNC_HOST": "192.168.1.100",
        "VNC_PORT": "5900",
        "VNC_AUTH": "auto",
        "VNC_USERNAME": "user",
        "VNC_PASSWORD": "pass"
      }
    }
  }
}
```

Only the VNC connection parameters are required. All other parameters are optional and use the default values shown below.

### Configuration

| Parameter                    | Default     | Description                                    |
|------------------------------|-------------|------------------------------------------------|
| `VNC_HOST`                   | `127.0.0.1` | VNC server address                             |
| `VNC_PORT`                   | `5900`      | VNC port number                                |
| `VNC_AUTH`                   | `auto`      | Authentication mode (`auto` / `none`)          |
| `VNC_USERNAME`               |             | Username (for VeNCrypt Plain / ARD)            |
| `VNC_PASSWORD`               |             | Password                                       |
| `DISPLAY_MAX_DIMENSION`      | `1280`      | Maximum dimension to scale screenshots to (px) |
| `VNC_CONNECT_TIMEOUT_MS`     | `10000`     | TCP connection timeout (ms)                    |
| `VNC_SCREENSHOT_TIMEOUT_MS`  | `3000`      | Screenshot frame wait timeout (ms)             |
| `HID_CLICK_HOLD_MS`          | `80`        | Mouse click hold duration (ms)                 |
| `HID_KEY_HOLD_MS`            | `50`        | Key press hold duration (ms)                   |
| `HID_TYPING_DELAY_MIN_MS`    | `30`        | Typing delay lower bound (ms)                  |
| `HID_TYPING_DELAY_MAX_MS`    | `100`       | Typing delay upper bound (ms)                  |
| `HID_SCROLL_EVENTS_PER_STEP` | `5`         | VNC scroll events per scroll step              |
| `DIFF_PIXEL_THRESHOLD`       | `30`        | Per-channel pixel difference threshold (0-255) |

## Tools

| Tool            | Returns           | Description                                              |
|-----------------|-------------------|----------------------------------------------------------|
| `mouse`         | `(x, y)`          | Mouse actions: move, hover, click, click_at, scroll, drag |
| `keyboard`      | `OK`              | Keyboard actions: press, combo, type, paste              |
| `screenshot`    | `OK` + image      | Capture full screen                                      |
| `cursor_crop`   | `(x, y)` + image  | Small crop around cursor position                        |
| `diff_check`    | `changeDetected`  | Lightweight pixel change detection against baseline      |
| `set_baseline`  | `OK`              | Save current screen as diff reference                    |
| `health_check`  | JSON              | VNC connection status, resolution, uptime, memory        |
| `wait`          | `OK`              | Wait for a specified duration                            |
| `task_complete` | summary           | Mark task as completed                                   |
| `task_failed`   | reason            | Mark task as failed                                      |

## Authentication

Supports multiple VNC authentication methods:

- **None** — no authentication
- **VNC Auth** — password-based challenge-response (DES)
- **ARD** — Apple Remote Desktop (Diffie-Hellman + AES)
- **VeNCrypt** — TLS-wrapped auth (Plain, VNC, None subtypes)

macOS Screen Sharing (ARD) is auto-detected via the `RFB 003.889` version string.

---

Copyright (c) 2025 Riza Emre ARAS — MIT License