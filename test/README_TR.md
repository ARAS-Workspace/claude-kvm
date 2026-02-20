# Entegrasyon Testi

VNC uzerinden uctan uca masaustu otomasyon testi icin hiyerarsik ajan mimarisi.

## Mimari

```mermaid
graph TB
    subgraph Planner["Opus · Planlayici"]
        P["Gorev Ayristirma<br/><i>Alt gorevleri dagitir</i>"]
    end

    subgraph Executor["Haiku · Yurutucu"]
        direction TB
        E["UI Yurutme<br/><i>Her dispatch icin taze context</i>"]
        VNC_Tools["VNC Aksiyonlari<br/><i>click · paste · scroll · queue</i>"]
        E --> VNC_Tools
    end

    subgraph Observer["Qwen-VL · Gozlemci"]
        O["Ekran Dogrulama<br/><i>Bagimsiz gorsel model</i>"]
    end

    subgraph MCP["claude-kvm · MCP"]
        D["Daemon<br/><i>VNC Client</i>"]
    end

    subgraph Target["Uzak Masaustu"]
        Desktop["XFCE · 1280x720<br/><i>Xvfb + x11vnc</i>"]
    end

    P -->|"dispatch(talimat)"| E
    E -->|"report(durum, ozet)"| P
    E -->|"verify(soru)"| O
    O -->|"metin yanit"| E
    VNC_Tools -->|"vnc_command / action_queue"| D
    D -->|"screenshot / sonuc"| VNC_Tools
    D <-->|"RFB Protokolu"| Desktop

    classDef planner fill:#1a1a2e,stroke:#533483,color:#e5e5e5
    classDef executor fill:#0f3460,stroke:#16213e,color:#e5e5e5
    classDef observer fill:#1a1a2e,stroke:#e94560,color:#e5e5e5
    classDef mcp fill:#16213e,stroke:#0f3460,color:#e5e5e5

    class P planner
    class E,VNC_Tools executor
    class O observer
    class D mcp
```

## Akis

```mermaid
sequenceDiagram
    participant P as Opus (Planlayici)
    participant E as Haiku (Yurutucu)
    participant O as Qwen-VL (Gozlemci)
    participant V as VNC Daemon

    P->>E: dispatch("Firefox'u ac, URL'ye git")
    activate E
    E->>V: screenshot
    V-->>E: gorsel
    E->>V: action_queue([click, paste, enter, wait, escape, click])
    V-->>E: OK x6
    E->>O: verify("Sayfa yuklendi mi?")
    O-->>E: "Evet, GitHub sayfasi gorunuyor"
    E-->>P: [success] Sayfa yuklendi
    deactivate E

    P->>E: dispatch("Kurulum komutunun yanindaki kopyala ikonuna tikla")
    activate E
    E->>V: screenshot
    V-->>E: gorsel
    E->>V: mouse_click(845, 523)
    V-->>E: OK
    E->>O: verify("Komut kopyalandi mi?")
    O-->>E: "Evet, pano ikonu kopyalandi durumunda"
    E-->>P: [success] Komut kopyalandi
    deactivate E

    P->>P: task_complete()
```

## Yapi

```
test/
├── integration.js              # Ana dosya — planlayici dongusu + dispatch
├── test_prompt.md              # Gorev tanimi
├── lib/
│   ├── config.js               # Tum yapilandirma (env-tabanli)
│   ├── executor.js             # Yurutucu dongusu (dispatch basina taze context)
│   ├── observer.js             # Gozlemci API (OpenRouter)
│   ├── mcp.js                  # MCP baglantisi + screenshot
│   └── log.js                  # Loglama + screenshot kaydetme
└── agents/
    ├── planner/
    │   └── system_prompt.md    # Opus — gorev planlama kurallari
    ├── executor/
    │   └── system_prompt.md    # Haiku — VNC teknik kurallari
    └── observer/
        └── system_prompt.md    # Qwen-VL — ekran betimleme
```

## Hizli Baslangic

```bash
cp .env.example .env
# ANTHROPIC_API_KEY ve OPENROUTER_API_KEY degerlerini girin
```

`VNC_HOST:VNC_PORT` adresinde erisilebilir bir VNC sunucusu oldugundan emin olun:

```bash
npm ci
node test/integration.js
```

## Yapilandirma

| Degisken | Varsayilan | Aciklama |
|---|---|---|
| `PLANNER_MODEL` | `claude-opus-4-6` | Planlayici modeli |
| `EXECUTOR_MODEL` | `claude-haiku-4-5-20251001` | Yurutucu modeli |
| `OBSERVER_MODEL` | `qwen/qwen3-vl-235b-a22b-instruct` | Gozlemci modeli (OpenRouter) |
| `PLANNER_MAX_TURNS` | `15` | Maks planlayici tur sayisi |
| `EXECUTOR_MAX_TURNS` | `5` | Dispatch basina maks yurutucu turu |
| `VNC_HOST` | `127.0.0.1` | VNC sunucu adresi |
| `VNC_PORT` | `5900` | VNC sunucu portu |
| `SCREENSHOTS_DIR` | `./test-screenshots` | Screenshot cikti dizini |

## CI

`test-v*` tag'i push'layarak GitHub Actions is akisini tetikleyin. DigitalOcean uzerinde Xvfb + XFCE + x11vnc ile bir droplet olusturur, SSH tuneli uzerinden testi calistirir ve ciktilari yukler.

```bash
git tag test-v0.3 && git push origin main test-v0.3
```

---

Copyright (c) 2026 Riza Emre ARAS — MIT License