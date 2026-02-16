# Claude KVM

Claude KVM, VNC üzerinden uzak masaüstü ortamınızı kontrol eden MCP aracıdır.

## Kullanım

Proje kök dizinine `.mcp.json` dosyası oluşturun:

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
        "CAPTURE_SCREENSHOT_DELAY_MS": "500",
        "CAPTURE_STABLE_FRAME_TIMEOUT_MS": "3000",
        "CAPTURE_STABLE_FRAME_THRESHOLD": "0.5",
        "DIFF_ENABLED": "true",
        "DIFF_PIXEL_THRESHOLD": "30",
        "DIFF_CHANGE_PERCENT_THRESHOLD": "0.5"
      }
    }
  }
}
```

Zorunlu olan sadece VNC bağlantı parametreleridir. Diğer parametreler opsiyoneldir ve yukarıdaki varsayılan değerlerle çalışır.

| Parametre                         | Varsayılan  | Açıklama                                             |
|-----------------------------------|-------------|------------------------------------------------------|
| `VNC_HOST`                        | `127.0.0.1` | VNC sunucu adresi                                    |
| `VNC_PORT`                        | `5900`      | VNC port numarası                                    |
| `VNC_AUTH`                        | `auto`      | Kimlik doğrulama modu (`auto` / `none`)              |
| `VNC_USERNAME`                    |             | Kullanıcı adı                                        |
| `VNC_PASSWORD`                    |             | Şifre                                                |
| `DISPLAY_MAX_DIMENSION`           | `1280`      | Ekran görüntüsünün ölçekleneceği maksimum boyut (px) |
| `HID_CLICK_HOLD_MS`               | `80`        | Fare tıklama süresi (ms)                             |
| `HID_KEY_HOLD_MS`                 | `50`        | Tuş basma süresi (ms)                                |
| `HID_TYPING_DELAY_MIN_MS`         | `30`        | Yazma gecikmesi alt sınır (ms)                       |
| `HID_TYPING_DELAY_MAX_MS`         | `100`       | Yazma gecikmesi üst sınır (ms)                       |
| `CAPTURE_SCREENSHOT_DELAY_MS`     | `500`       | İşlem sonrası ekran görüntüsü bekleme süresi (ms)    |
| `CAPTURE_STABLE_FRAME_TIMEOUT_MS` | `3000`      | Kare sabitleme zaman aşımı (ms)                      |
| `CAPTURE_STABLE_FRAME_THRESHOLD`  | `0.5`       | Kare sabitleme eşik değeri (%)                       |
| `DIFF_ENABLED`                    | `true`      | Kare farkı algılamayı etkinleştir                    |
| `DIFF_PIXEL_THRESHOLD`            | `30`        | Piksel farkı eşik değeri                             |
| `DIFF_CHANGE_PERCENT_THRESHOLD`   | `0.5`       | Değişim yüzdesi eşik değeri                          |

---

Copyright (c) 2025 Rıza Emre ARAS — MIT Lisansı