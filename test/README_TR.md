# Entegrasyon Testi

VNC üzerinden uçtan uca masaüstü otomasyon testi için hiyerarşik ajan mimarisi.

## Akış

```mermaid
sequenceDiagram
    participant P as Opus (Planlayıcı)
    participant E as Haiku (Yürütücü)
    participant O as Qwen-VL (Gözlemci)
    participant V as VNC Daemon

    P->>E: dispatch("Firefox'u aç, URL'ye git")
    activate E
    E->>V: screenshot
    V-->>E: görsel
    E->>V: action_queue([click, paste, enter, wait, escape, click])
    V-->>E: OK x6
    E->>O: verify("Sayfa yüklendi mi?")
    O-->>E: "Evet, GitHub sayfası görünüyor"
    E-->>P: [success] Sayfa yüklendi
    deactivate E

    P->>E: dispatch("Kurulum komutunun yanındaki kopyala ikonuna tıkla")
    activate E
    E->>V: screenshot
    V-->>E: görsel
    E->>V: mouse_click(845, 523)
    V-->>E: OK
    E->>O: verify("Komut kopyalandı mı?")
    O-->>E: "Evet, pano ikonu kopyalandı durumunda"
    E-->>P: [success] Komut kopyalandı
    deactivate E

    P->>P: task_complete()
```

## Dizin Hiyerarşisi

```
test/
├── integration.js
├── test_prompt.md
├── lib/
│   ├── config.js
│   ├── executor.js
│   ├── observer.js
│   ├── mcp.js
│   └── log.js
└── agents/
    ├── planner/
    │   └── system_prompt.md
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
| `PLANNER_MODEL`      | `claude-opus-4-6`                  |
| `EXECUTOR_MODEL`     | `claude-haiku-4-5-20251001`        |
| `OBSERVER_MODEL`     | `qwen/qwen3-vl-235b-a22b-instruct` |
| `PLANNER_MAX_TURNS`  | `15`                               |
| `EXECUTOR_MAX_TURNS` | `5`                                |
| `VNC_HOST`           | `127.0.0.1`                        |
| `VNC_PORT`           | `5900`                             |
| `SCREENSHOTS_DIR`    | `./test-screenshots`               |

---

Copyright (c) 2026 Rıza Emre ARAS — MIT License