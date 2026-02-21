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

### Sistem Komutları

- [Yürütücü (Claude)](https://github.com/ARAS-Workspace/claude-kvm/blob/main/test/agents/executor/system_prompt.md)
- [Gözlemci (Qwen-VL)](https://github.com/ARAS-Workspace/claude-kvm/blob/main/test/agents/observer/system_prompt.md)
- [Test Komutu](https://github.com/ARAS-Workspace/claude-kvm/blob/main/test/test_prompt.md)

## Canlı Süreçler

Aşağıdaki görsel içerikler, CI ortamında VNC üzerinden gerçekleştirilen bir entegrasyon testinden türetilmiştir. Test sırasında verilen komut:

```
1. Open the File Manager (Thunar) — double-click the "Home" icon on the desktop or find it in the taskbar
2. Create a new folder named "claude-kvm-test" — right-click empty area → Create Folder
3. Open "claude-kvm-test"
4. Inside it, create another folder named "logs"
5. Verify both folders exist, then call task_complete()
```

Ekran kaydı ve terminal logları [Demo Asset Üretimi](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22245043165) workflow'unda 4x hızlandırılarak işlenmiştir.

- [Entegrasyon Testi](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22242573195)
- [Demo Asset Üretimi](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22245043165)

> [!NOTE]
> Bu akış, süreci anlaşılır kılmak adına basit tutularak belirlenmiştir. Daha kapsamlı senaryolar alt branch'lerde ele alınacak olup, main branch üzerindeki test akışı her zaman temiz ve sade kalacaktır. Ürünün gerçek iş akışlarına nasıl dahil olduğunu görmek isterseniz bu testleri incelemenizi öneririm — aracı değerlendirme sürecinizde en etkili referans bu görüntüler olacaktır. Bununla birlikte, incelediğiniz bu döküman bundan sonra yapılacak testlerin uçtan uca test disiplinini açıkça ortaya koymaktadır.

### Artifact

```
test/assets/
├── demo-screen.mp4
├── demo-terminal.gif
├── demo-terminal.mp4
├── press-kit-assets-22242573195.gif
└── press-kit-assets-22242573195.mp4
```

- [demo-screen.mp4](https://github.com/ARAS-Workspace/claude-kvm/tree/main/test/assets/demo-screen.mp4)
- [demo-terminal.gif](https://github.com/ARAS-Workspace/claude-kvm/tree/main/test/assets/demo-terminal.gif)
- [demo-terminal.mp4](https://github.com/ARAS-Workspace/claude-kvm/tree/main/test/assets/demo-terminal.mp4)
- [press-kit-assets-22242573195.gif](https://github.com/ARAS-Workspace/claude-kvm/tree/main/test/assets/press-kit-assets-22242573195.gif)
- [press-kit-assets-22242573195.mp4](https://github.com/ARAS-Workspace/claude-kvm/tree/main/test/assets/press-kit-assets-22242573195.mp4)

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
