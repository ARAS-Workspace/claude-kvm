# Claude KVM

Claude KVM, VNC protokolü üzerinden uzak masaüstü ortamlarını kontrol eden bir MCP aracıdır. İnce bir JS proxy katmanı (MCP server) ve MacOS sisteminizde çalışan platformunuza native bir Swift VNC daemon'dan oluşur.

## Mimari

```mermaid
graph TB
    subgraph MCP["MCP Client (Claude)"]
        AI["Claude"]
    end

    subgraph Proxy["claude-kvm · MCP Proxy (stdio)"]
        direction TB
        Server["MCP Server<br/><code>index.js</code>"]
        Tools["Tool Definitions<br/><code>tools/index.js</code>"]
        Server --> Tools
    end

    subgraph Daemon["claude-kvm-daemon · Native VNC Client (stdin/stdout)"]
        direction TB
        CMD["Command Handler<br/><i>PC Dispatch</i>"]
        Scale["Display Scaling<br/><i>Scaled ↔ Native</i>"]

        subgraph Screen["Ekran"]
            Capture["Frame Capture<br/><i>PNG · Crop · Diff</i>"]
        end

        subgraph InputGroup["Girdi"]
            Mouse["Fare<br/><i>Click · Drag · Move · Scroll</i>"]
            KB["Klavye<br/><i>Tap · Combo · Type · Paste</i>"]
        end

        VNC["VNC Bridge<br/><i>LibVNCClient 0.9.15</i>"]

        CMD --> Scale
        Scale --> Capture
        Scale --> Mouse
        Scale --> KB
        Capture -.->|"framebuffer"| VNC
        Mouse -->|"pointer events"| VNC
        KB -->|"key events"| VNC
    end

    subgraph Target["Hedef Makine"]
        VNC_Server["VNC Server<br/><i>:5900</i>"]
        Desktop["Masaüstü Ortamı"]
        VNC_Server --> Desktop
    end

    AI <-->|"stdio<br/>JSON-RPC"| Server
    Server <-->|"stdin/stdout<br/>PC (NDJSON)"| CMD
    VNC <-->|"RFB Protocol<br/>TCP :5900"| VNC_Server

    classDef proxy fill:#1a1a2e,stroke:#16213e,color:#e5e5e5
    classDef daemon fill:#0f3460,stroke:#533483,color:#e5e5e5
    classDef target fill:#1a1a2e,stroke:#e94560,color:#e5e5e5

    class Server,Tools proxy
    class CMD,Scale,VNC,Capture,Mouse,KB daemon
    class VNC_Server,Desktop target
```

### Katmanlar

| Katman         | Dil                     | Görev                                                                      | İletişim                 |
|----------------|-------------------------|----------------------------------------------------------------------------|--------------------------|
| **MCP Proxy**  | JavaScript (Node.js)    | Claude ile MCP protokolü üzerinden iletişim, daemon yaşam döngüsü yönetimi | stdio JSON-RPC           |
| **VNC Daemon** | Swift/C (Apple Silicon) | VNC bağlantısı, ekran yakalama, fare/klavye giriş enjeksiyonu              | stdin/stdout PC (NDJSON) |

### PC (Procedure Call) Protokolü

Proxy ve daemon arasındaki iletişim NDJSON üzerinden PC protokolünü kullanır:

```
İstek:    {"method":"<isim>","params":{...},"id":<int|string>}
Yanıt:    {"result":{...},"id":<int|string>}
Hata:     {"error":{"code":<int>,"message":"..."},"id":<int|string>}
Bildirim: {"method":"<isim>","params":{...}}
```

### Koordinat Ölçekleme

VNC sunucusunun doğal çözünürlüğü `--max-dimension` (varsayılan: 1280px) sınırını aşmayacak şekilde ölçeklenir. Claude ölçeklenmiş koordinatla daha fazla uyum içerisinde çalışır — daemon arka planda dönüşüm yapar:

```
Doğal:       4220 x 2568  (VNC sunucu framebuffer)
Ölçeklenmiş: 1280 x 779   (Claude'un gördükleri ve hedefledikleri)

mouse_click(640, 400) → VNC alır (2110, 1284)
```

### Üç Katmanlı Ekran Stratejisi

Claude, kademeli doğrulama yaklaşımıyla token maliyetini minimize eder:

```
diff_check  →  changeDetected: true/false     ~5ms   (yalnızca metin, görüntü yok)
cursor_crop →  imleç etrafında kare kesit     ~50ms  (küçük görüntü)
screenshot  →  tam ekran yakalama             ~200ms (tam görüntü)
```

Ucuzdan başla, yalnızca gerektiğinde yükselt.

---

## Kurulum

### Gereksinimler

- macOS (Apple Silicon / aarch64)
- Node.js (LTS)

### Daemon

```bash
brew tap ARAS-Workspace/tap
brew install claude-kvm-daemon
```

> [!NOTE]
> `claude-kvm-daemon`, CI (GitHub Actions) üzerinde derlenir ve code-sign edilir. Derleme çıktısı iki formatta paketlenir: Homebrew dağıtımı için `.tar.gz` arşivi ve notarizasyon için `.dmg` disk imajı. DMG paketi aynı akış içerisinde Apple sunucularına gönderilir ve notarize edilir — süreç CI loglarından takip edilebilir. Notarize edilmiş DMG, CI Artifacts üzerinde yer alır; arşivlenen `.tar.gz` ise repo üzerinde release olarak da yayınlanır. Homebrew kurulumu bu release'i takip eder.
>
> - [Release](https://github.com/ARAS-Workspace/claude-kvm/releases/tag/daemon-v1.0.0) · [Build Workflow](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22148745112) · [Kaynak Kod](https://github.com/ARAS-Workspace/claude-kvm/tree/daemon-tool)
> - [LibVNC Build](https://github.com/ARAS-Workspace/claude-kvm/actions/runs/22122975416) · [LibVNC Branch](https://github.com/ARAS-Workspace/claude-kvm/tree/libvnc-build)
> - [Homebrew Tap](https://github.com/ARAS-Workspace/homebrew-tap)

### MCP Yapılandırması

Proje dizinine `.mcp.json` dosyası oluşturun:

```json
{
  "mcpServers": {
    "claude-kvm": {
      "command": "npx",
      "args": ["-y", "github:ARAS-Workspace/claude-kvm"],
      "env": {
        "VNC_HOST": "192.168.1.100",
        "VNC_PORT": "5900",
        "VNC_USERNAME": "user",
        "VNC_PASSWORD": "pass",
        "CLAUDE_KVM_DAEMON_PATH": "/opt/homebrew/bin/claude-kvm-daemon",
        "CLAUDE_KVM_DAEMON_PARAMETERS": "--max-dimension 1280 -v"
      }
    }
  }
}
```

### Yapılandırma

#### MCP Proxy (ENV)

| Parametre                      | Varsayılan          | Açıklama                                   |
|--------------------------------|---------------------|--------------------------------------------|
| `VNC_HOST`                     | `127.0.0.1`         | VNC sunucu adresi                          |
| `VNC_PORT`                     | `5900`              | VNC port numarası                          |
| `VNC_USERNAME`                 |                     | Kullanıcı adı (ARD için zorunlu)           |
| `VNC_PASSWORD`                 |                     | Şifre                                      |
| `CLAUDE_KVM_DAEMON_PATH`       | `claude-kvm-daemon` | Daemon binary yolu (PATH'te ise gerek yok) |
| `CLAUDE_KVM_DAEMON_PARAMETERS` |                     | Daemon'a ek CLI argümanları                |

#### Daemon Parametreleri (CLI)

`CLAUDE_KVM_DAEMON_PARAMETERS` üzerinden daemon'a iletilen ek argümanlar:

```
"CLAUDE_KVM_DAEMON_PARAMETERS": "--max-dimension 800 --click-hold-ms 80 --key-hold-ms 50 -v"
```

Tüm zamanlama varsayılanları [`InputTiming`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/Input/KeySymbols.swift) struct'ında tanımlanır.

**Genel:** [`main.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/main.swift) · [`DisplayScaling.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/DisplayScaling.swift) · [`VNCBridge.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/VNC/VNCBridge.swift)

| Parametre           | Varsayılan | Açıklama                                     |
|---------------------|------------|----------------------------------------------|
| `--max-dimension`   | `1280`     | Ekran ölçekleme maksimum boyutu (px)         |
| `--connect-timeout` |            | VNC bağlantı zaman aşımı (saniye)            |
| `--bits-per-sample` |            | Piksel başına bit sayısı                     |
| `--no-reconnect`    |            | Otomatik yeniden bağlanmayı devre dışı bırak |
| `-v, --verbose`     |            | Ayrıntılı loglama (stderr)                   |

**Fare zamanlama:** [`MouseClick.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/Input/MouseClick.swift) · [`MouseMovement.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/Input/MouseMovement.swift)

| Parametre               | Varsayılan | Açıklama                      |
|-------------------------|------------|-------------------------------|
| `--click-hold-ms`       | `50`       | Tıklama basılı tutma süresi   |
| `--double-click-gap-ms` | `50`       | Çift tıklama arası bekleme    |
| `--hover-settle-ms`     | `400`      | Hover yerleşme bekleme süresi |

**Sürükleme zamanlama:** [`MouseDrag.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/Input/MouseDrag.swift)

| Parametre                | Varsayılan | Açıklama                              |
|--------------------------|------------|---------------------------------------|
| `--drag-position-ms`     | `30`       | Sürükleme öncesi pozisyon bekleme     |
| `--drag-press-ms`        | `50`       | Sürükleme basılı tutma eşiği          |
| `--drag-step-ms`         | `5`        | İnterpolasyon noktaları arası gecikme |
| `--drag-settle-ms`       | `30`       | Bırakma öncesi yerleşme bekleme       |
| `--drag-pixels-per-step` | `20`       | Piksel başına nokta yoğunluğu         |
| `--drag-min-steps`       | `10`       | Minimum interpolasyon adımı           |

**Scroll zamanlama:** [`Scroll.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/Input/Scroll.swift)

| Parametre           | Varsayılan | Açıklama                 |
|---------------------|------------|--------------------------|
| `--scroll-press-ms` | `10`       | Scroll basın-bırak arası |
| `--scroll-tick-ms`  | `20`       | Tick'ler arası gecikme   |

**Klavye zamanlama:** [`KeyPress.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/Input/KeyPress.swift)

| Parametre        | Varsayılan | Açıklama                         |
|------------------|------------|----------------------------------|
| `--key-hold-ms`  | `30`       | Tuş basılı tutma süresi          |
| `--combo-mod-ms` | `10`       | Modifier tuş yerleşme gecikmesi  |

**Yazma zamanlama:** [`TextInput.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/Input/TextInput.swift)

| Parametre             | Varsayılan | Açıklama                         |
|-----------------------|------------|----------------------------------|
| `--type-key-ms`       | `20`       | Yazma sırasında tuş basılı tutma |
| `--type-inter-key-ms` | `20`       | Karakterler arası gecikme        |
| `--type-shift-ms`     | `10`       | Shift tuş yerleşme süresi        |
| `--paste-settle-ms`   | `30`       | Pano yazma sonrası bekleme       |

**Görüntü:** [`FrameCapture.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/FrameCapture.swift) · [`CommandHandler.swift`](https://github.com/ARAS-Workspace/claude-kvm/blob/daemon-tool/ClaudeKVM-Daemon/CommandHandler.swift)

| Parametre              | Varsayılan | Açıklama                   |
|------------------------|------------|----------------------------|
| `--cursor-crop-radius` | `150`      | Cursor crop yarıçapı (px)  |

---

## Araçlar

Tek bir `vnc_command` aracı üzerinden tüm işlemler gerçekleştirilir:

### Ekran

| Aksiyon        | Parametreler | Açıklama                                   |
|----------------|--------------|--------------------------------------------|
| `screenshot`   |              | Tam ekran PNG görüntüsü                    |
| `cursor_crop`  |              | İmleç etrafında crosshair'li kesit         |
| `diff_check`   |              | Baseline'a göre ekran değişim algılama     |
| `set_baseline` |              | Mevcut ekranı diff referansı olarak kaydet |

### Fare

| Aksiyon              | Parametreler               | Açıklama                       |
|----------------------|----------------------------|--------------------------------|
| `mouse_click`        | `x, y, button?`            | Tıklama (left\|right\|middle)  |
| `mouse_double_click` | `x, y`                     | Çift tıklama                   |
| `mouse_move`         | `x, y`                     | İmleci taşı                    |
| `hover`              | `x, y`                     | Taşı + yerleşme bekleme        |
| `nudge`              | `dx, dy`                   | Göreceli imleç hareketi        |
| `mouse_drag`         | `x, y, toX, toY`           | Başlangıçtan bitişe sürükleme  |
| `scroll`             | `x, y, direction, amount?` | Scroll (up\|down\|left\|right) |

### Klavye

| Aksiyon     | Parametreler      | Açıklama                                                 |
|-------------|-------------------|----------------------------------------------------------|
| `key_tap`   | `key`             | Tekli tuş basımı (enter\|escape\|tab\|space\|...)        |
| `key_combo` | `key` veya `keys` | Modifier kombinasyonu ("cmd+c" veya ["cmd","shift","3"]) |
| `key_type`  | `text`            | Karakter karakter metin yazma                            |
| `paste`     | `text`            | Pano üzerinden yapıştırma                                |

### Kontrol

| Aksiyon    | Parametreler | Açıklama                          |
|------------|--------------|-----------------------------------|
| `wait`     | `ms?`        | Bekleme (varsayılan 500ms)        |
| `health`   |              | Bağlantı durumu + ekran boyutları |
| `shutdown` |              | Daemon'u düzgün kapatma           |

---

## Kimlik Doğrulama

Desteklenen VNC kimlik doğrulama yöntemleri:

- **VNC Auth** — şifre tabanlı challenge-response (DES)
- **ARD** — Apple Remote Desktop (Diffie-Hellman + AES-128-ECB)

macOS, ARD auth type 30 kimlik bilgisi isteği üzerinden otomatik algılanır. Algılandığında Meta tuşları Super'e yeniden eşlenir (Command tuşu uyumluluğu).

---

Copyright (c) 2026 Rıza Emre ARAS — MIT Lisansı