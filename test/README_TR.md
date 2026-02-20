# Entegrasyon Testi

VNC üzerinden uçtan uca masaüstü otomasyon testi.

## Akış

```mermaid
sequenceDiagram
    participant E as Claude (Yürütücü)
    participant O as Qwen-VL (Gözlemci)
    participant V as VNC Daemon

    E->>V: screenshot
    V-->>E: görsel
    E->>V: action_queue([click, escape, paste, enter, wait])
    V-->>E: OK x5
    E->>O: verify("Sayfa yüklendi mi?")
    O-->>E: "Evet, GitHub sayfası görünüyor"

    E->>V: mouse_click(845, 523)
    V-->>E: OK
    E->>O: verify("Komut kopyalandı mı?")
    O-->>E: "Evet, pano ikonu kopyalandı durumunda"

    E->>E: task_complete()
```

## Dizin Hiyerarşisi

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

## Hızlı Başlangıç

```bash
cp .env.example .env
npm ci
node test/integration.js
```

## Konfigürasyon

| Değişken             | Varsayılan                         |
|----------------------|------------------------------------|
| `EXECUTOR_MODEL`     | `claude-opus-4-6`                  |
| `OBSERVER_MODEL`     | `qwen/qwen3-vl-235b-a22b-instruct` |
| `EXECUTOR_MAX_TURNS` | `30`                               |
| `VNC_HOST`           | `127.0.0.1`                        |
| `VNC_PORT`           | `5900`                             |
| `SCREENSHOTS_DIR`    | `./test-screenshots`               |

---

Copyright (c) 2026 Rıza Emre ARAS — MIT License
