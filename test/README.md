# Integration Test

End-to-end desktop automation testing over VNC with coordinate grounding.

## Flow

```mermaid
sequenceDiagram
    participant E as Claude (Executor)
    participant O as Qwen-VL (Observer)
    participant V as VNC Daemon

    E->>V: screenshot
    V-->>E: image
    E->>V: action_queue([click, escape, paste, enter, wait])
    V-->>E: OK x5
    E->>O: verify("Did the page load?")
    O-->>E: "Yes, GitHub page is showing"

    E->>V: mouse_click(845, 523)
    V-->>E: OK
    E->>O: verify("Was the button clicked?")
    O-->>E: "No, nothing changed"

    E->>O: ground("copy button next to install command")
    O-->>E: "842,525"
    E->>V: mouse_click(842, 525)
    V-->>E: OK

    E->>E: task_complete()
```

## Directory

```
test/
├── integration.js
├── test_prompt.md
├── lib/
│   ├── config.js
│   ├── observer.js
│   ├── mcp.js
│   └── log.js
└── agents/
    ├── executor/
    │   └── system_prompt.md
    └── observer/
        └── system_prompt.md
```

## Quick Start

```bash
cp .env.example .env
npm ci
node test/integration.js
```

## Configuration

| Variable             | Default                            |
|----------------------|------------------------------------|
| `EXECUTOR_MODEL`     | `claude-opus-4-6`                  |
| `OBSERVER_MODEL`     | `qwen/qwen3-vl-235b-a22b-instruct` |
| `EXECUTOR_MAX_TURNS` | `30`                               |
| `VNC_HOST`           | `127.0.0.1`                        |
| `VNC_PORT`           | `5900`                             |
| `SCREENSHOTS_DIR`    | `./test-screenshots`               |

---

Copyright (c) 2026 Riza Emre ARAS — MIT License
