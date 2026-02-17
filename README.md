# Claude KVM

Claude KVM is an MCP tool that controls your remote desktop environment over VNC.

## Usage

Create a `.mcp.json` file in your project root directory:

```json
{
  "mcpServers": {
    "claude-kvm": {
      "command": "npx",
      "args": ["-y", "github:ARAS-Workspace/claude-kvm#mcp"],
      "env": {
        "VNC_HOST": "192.168.1.100",
        "VNC_PORT": "5900",
        "VNC_AUTH": "auto",
        "VNC_USERNAME": "user",
        "VNC_PASSWORD": "pass",

        "DISPLAY_MAX_DIMENSION": "1280",
        "HID_CLICK_HOLD_MS": "80",
        "HID_KEY_HOLD_MS": "50",
        "HID_TYPING_DELAY_MIN_MS": "30",
        "HID_TYPING_DELAY_MAX_MS": "100",
        "CAPTURE_STABLE_FRAME_THRESHOLD": "0.5",
        "DIFF_PIXEL_THRESHOLD": "30"
      }
    }
  }
}
```

Only the VNC connection parameters are required. All other parameters are optional and use the default values shown above.

| Parameter                        | Default     | Description                                    |
|----------------------------------|-------------|------------------------------------------------|
| `VNC_HOST`                       | `127.0.0.1` | VNC server address                             |
| `VNC_PORT`                       | `5900`      | VNC port number                                |
| `VNC_AUTH`                       | `auto`      | Authentication mode (`auto` / `none`)          |
| `VNC_USERNAME`                   |             | Username                                       |
| `VNC_PASSWORD`                   |             | Password                                       |
| `DISPLAY_MAX_DIMENSION`          | `1280`      | Maximum dimension to scale screenshots to (px) |
| `HID_CLICK_HOLD_MS`              | `80`        | Mouse click hold duration (ms)                 |
| `HID_KEY_HOLD_MS`                | `50`        | Key press hold duration (ms)                   |
| `HID_TYPING_DELAY_MIN_MS`        | `30`        | Typing delay lower bound (ms)                  |
| `HID_TYPING_DELAY_MAX_MS`        | `100`       | Typing delay upper bound (ms)                  |
| `CAPTURE_STABLE_FRAME_THRESHOLD` | `0.5`       | Diff change detection threshold (%)            |
| `DIFF_PIXEL_THRESHOLD`           | `30`        | Per-channel pixel difference threshold (0-255) |

## Tools

| Tool            | Returns           | Description                                          |
|-----------------|-------------------|------------------------------------------------------|
| `mouse`         | `(x, y)`          | Mouse actions: move, click, click_at, scroll, drag   |
| `keyboard`      | `OK`              | Keyboard actions: press, combo, type, paste          |
| `screenshot`    | `OK` + image      | Capture full screen                                  |
| `cursor_crop`   | `(x, y)` + image  | Small crop around cursor position                    |
| `diff_check`    | text              | Lightweight change detection against baseline        |
| `set_baseline`  | `OK`              | Save current screen as diff reference                |
| `wait`          | `OK`              | Wait for a specified duration                        |
| `task_complete` | summary           | Mark task as completed                               |
| `task_failed`   | reason            | Mark task as failed                                  |

---

Copyright (c) 2025 Riza Emre ARAS — MIT License