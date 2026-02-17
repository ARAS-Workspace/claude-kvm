# Claude KVM

Claude KVM, VNC üzerinden uzak masaüstü ortamınızı kontrol eden, opsiyonel SSH ile kabuk erişimi sağlayan MCP aracıdır.

## Kullanım

Proje kök dizinine `.mcp.json` dosyası oluşturun:

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
        "VNC_PASSWORD": "pass",
        "SSH_HOST": "192.168.1.100",
        "SSH_USER": "user",
        "SSH_PASSWORD": "pass"
      }
    }
  }
}
```

Zorunlu olan sadece VNC bağlantı parametreleridir. SSH ve diğer parametreler opsiyoneldir.

### Yapılandırma

#### VNC

| Parametre                    | Varsayılan  | Açıklama                                             |
|------------------------------|-------------|------------------------------------------------------|
| `VNC_HOST`                   | `127.0.0.1` | VNC sunucu adresi                                    |
| `VNC_PORT`                   | `5900`      | VNC port numarası                                    |
| `VNC_AUTH`                   | `auto`      | Kimlik doğrulama modu (`auto` / `none`)              |
| `VNC_USERNAME`               |             | Kullanıcı adı (VeNCrypt Plain / ARD için)            |
| `VNC_PASSWORD`               |             | Şifre                                                |
| `VNC_CONNECT_TIMEOUT_MS`     | `10000`     | TCP bağlantı zaman aşımı (ms)                        |
| `VNC_SCREENSHOT_TIMEOUT_MS`  | `3000`      | Ekran görüntüsü frame bekleme süresi (ms)            |

#### SSH (opsiyonel)

| Parametre       | Varsayılan | Açıklama                                              |
|-----------------|------------|-------------------------------------------------------|
| `SSH_HOST`      |            | SSH sunucu adresi (SSH'ı etkinleştirmek için zorunlu) |
| `SSH_USER`      |            | SSH kullanıcı adı (SSH'ı etkinleştirmek için zorunlu) |
| `SSH_PASSWORD`  |            | SSH şifresi (şifre doğrulaması için)                  |
| `SSH_KEY`       |            | Özel anahtar dosya yolu (anahtar doğrulaması için)    |
| `SSH_PORT`      | `22`       | SSH port numarası                                     |

SSH aracı yalnızca `SSH_HOST` ve `SSH_USER` ayarlandığında kaydedilir. Kimlik doğrulama şifre veya anahtar ile yapılır — hangisi sağlanırsa o kullanılır.

#### Ekran ve Girdi

| Parametre                    | Varsayılan  | Açıklama                                             |
|------------------------------|-------------|------------------------------------------------------|
| `DISPLAY_MAX_DIMENSION`      | `1280`      | Ekran görüntüsünün ölçekleneceği maksimum boyut (px) |
| `HID_CLICK_HOLD_MS`          | `80`        | Fare tıklama süresi (ms)                             |
| `HID_KEY_HOLD_MS`            | `50`        | Tuş basma süresi (ms)                                |
| `HID_TYPING_DELAY_MIN_MS`    | `30`        | Yazma gecikmesi alt sınır (ms)                       |
| `HID_TYPING_DELAY_MAX_MS`    | `100`       | Yazma gecikmesi üst sınır (ms)                       |
| `HID_SCROLL_EVENTS_PER_STEP` | `5`         | Scroll adımı başına VNC scroll olayı                 |
| `DIFF_PIXEL_THRESHOLD`       | `30`        | Piksel farkı eşik değeri (0-255)                     |

## Araçlar

| Araç            | Dönen Değer        | Açıklama                                                   |
|-----------------|--------------------|------------------------------------------------------------|
| `mouse`         | `(x, y)`           | Fare işlemleri: move, hover, click, click_at, scroll, drag |
| `keyboard`      | `OK`               | Klavye işlemleri: press, combo, type, paste                |
| `screenshot`    | `OK` + görüntü     | Tam ekran görüntüsü                                        |
| `cursor_crop`   | `(x, y)` + görüntü | Cursor etrafındaki küçük kesit                             |
| `diff_check`    | `changeDetected`   | Baseline'a karşı piksel değişim algılama                   |
| `set_baseline`  | `OK`               | Mevcut ekranı diff referansı olarak kaydet                 |
| `health_check`  | JSON               | VNC/SSH durumu, çözünürlük, uptime, bellek                 |
| `ssh`           | stdout/stderr      | Uzak makinede SSH üzerinden komut çalıştır                 |
| `wait`          | `OK`               | Belirtilen süre kadar bekle                                |
| `task_complete` | özet               | Görevi tamamlandı olarak işaretle                          |
| `task_failed`   | neden              | Görevi başarısız olarak işaretle                           |

## Kimlik Doğrulama

### VNC

Desteklenen VNC kimlik doğrulama yöntemleri:

- **None** — kimlik doğrulama yok
- **VNC Auth** — şifre tabanlı challenge-response (DES)
- **ARD** — Apple Remote Desktop (Diffie-Hellman + AES)
- **VeNCrypt** — TLS sarmalı auth (Plain, VNC, None alt tipleri)

macOS Screen Sharing (ARD) `RFB 003.889` sürüm dizesi ile otomatik algılanır.

### SSH

Şifre ve özel anahtar kimlik doğrulamasını destekler. Hedef macOS olduğunda SSH aracı AppleScript çalıştırma (`osascript`), pano erişimi (`pbpaste`/`pbcopy`) ve sistem düzeyinde kontrol sağlar.

---

Copyright (c) 2025 Rıza Emre ARAS — MIT Lisansı
