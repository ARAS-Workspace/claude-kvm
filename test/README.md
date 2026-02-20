# Integration Test

Hierarchical agent architecture for end-to-end desktop automation testing over VNC.

## Architecture

```mermaid
graph TB
    subgraph Planner["Opus · Planner"]
        P["Task Decomposition<br/><i>Dispatches sub-tasks</i>"]
    end

    subgraph Executor["Haiku · Executor"]
        direction TB
        E["UI Execution<br/><i>Fresh context per dispatch</i>"]
        VNC_Tools["VNC Actions<br/><i>click · paste · scroll · queue</i>"]
        E --> VNC_Tools
    end

    subgraph Observer["Qwen-VL · Observer"]
        O["Screen Verification<br/><i>Independent vision model</i>"]
    end

    subgraph MCP["claude-kvm · MCP"]
        D["Daemon<br/><i>VNC Client</i>"]
    end

    subgraph Target["Remote Desktop"]
        Desktop["XFCE · 1280x720<br/><i>Xvfb + x11vnc</i>"]
    end

    P -->|"dispatch(instruction)"| E
    E -->|"report(status, summary)"| P
    E -->|"verify(question)"| O
    O -->|"text answer"| E
    VNC_Tools -->|"vnc_command / action_queue"| D
    D -->|"screenshot / result"| VNC_Tools
    D <-->|"RFB Protocol"| Desktop

    classDef planner fill:#1a1a2e,stroke:#533483,color:#e5e5e5
    classDef executor fill:#0f3460,stroke:#16213e,color:#e5e5e5
    classDef observer fill:#1a1a2e,stroke:#e94560,color:#e5e5e5
    classDef mcp fill:#16213e,stroke:#0f3460,color:#e5e5e5

    class P planner
    class E,VNC_Tools executor
    class O observer
    class D mcp
```

## Flow

```mermaid
sequenceDiagram
    participant P as Opus (Planner)
    participant E as Haiku (Executor)
    participant O as Qwen-VL (Observer)
    participant V as VNC Daemon

    P->>E: dispatch("Open Firefox, navigate to URL")
    activate E
    E->>V: screenshot
    V-->>E: image
    E->>V: action_queue([click, paste, enter, wait, escape, click])
    V-->>E: OK x6
    E->>O: verify("Did the page load?")
    O-->>E: "Yes, GitHub page is showing"
    E-->>P: [success] Page loaded
    deactivate E

    P->>E: dispatch("Click the copy icon next to install command")
    activate E
    E->>V: screenshot
    V-->>E: image
    E->>V: mouse_click(845, 523)
    V-->>E: OK
    E->>O: verify("Was the command copied?")
    O-->>E: "Yes, clipboard icon shows copied state"
    E-->>P: [success] Command copied
    deactivate E

    P->>P: task_complete()
```

## Structure

```
test/
├── integration.js              # Main — planner loop + dispatch
├── test_prompt.md              # Task description
├── lib/
│   ├── config.js               # All configuration (env-driven)
│   ├── executor.js             # Executor loop (fresh context per dispatch)
│   ├── observer.js             # Observer API (OpenRouter)
│   ├── mcp.js                  # MCP connection + screenshot
│   └── log.js                  # Logging + screenshot save
└── agents/
    ├── planner/
    │   └── system_prompt.md    # Opus — task planning rules
    ├── executor/
    │   └── system_prompt.md    # Haiku — VNC technical rules
    └── observer/
        └── system_prompt.md    # Qwen-VL — screen description
```

## Quick Start

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and OPENROUTER_API_KEY
```

Ensure a VNC server is accessible at `VNC_HOST:VNC_PORT`, then:

```bash
npm ci
node test/integration.js
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PLANNER_MODEL` | `claude-opus-4-6` | Planner model |
| `EXECUTOR_MODEL` | `claude-haiku-4-5-20251001` | Executor model |
| `OBSERVER_MODEL` | `qwen/qwen3-vl-235b-a22b-instruct` | Observer model (OpenRouter) |
| `PLANNER_MAX_TURNS` | `15` | Max planner turns |
| `EXECUTOR_MAX_TURNS` | `5` | Max executor turns per dispatch |
| `VNC_HOST` | `127.0.0.1` | VNC server host |
| `VNC_PORT` | `5900` | VNC server port |
| `SCREENSHOTS_DIR` | `./test-screenshots` | Screenshot output directory |

## CI

Push a `test-v*` tag to trigger the GitHub Actions workflow. It provisions a DigitalOcean droplet with Xvfb + XFCE + x11vnc, runs the test via SSH tunnel, and uploads artifacts.

```bash
git tag test-v0.3 && git push origin main test-v0.3
```

---

Copyright (c) 2026 Riza Emre ARAS — MIT License