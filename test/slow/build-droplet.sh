#!/bin/bash
# SPDX-License-Identifier: MIT
# Claude KVM — droplet desktop builder (hardened, reboot-persistent).
#
# Run INSIDE a fresh Ubuntu 24.04 droplet (as root). Based on the desktop
# setup steps of main/.github/workflows/integration-test.yml: installs
# Xvfb + XFCE + x11vnc, installs a systemd service so the desktop survives
# reboots with the same password, generates a VNC password and prints
# connection-ready output (paste straight into test/slow/.env, or store as
# CI secrets VNC_HOST / VNC_PORT / VNC_PASSWORD).
#
# Test-environment trade-off: x11vnc listens on all interfaces with the
# generated password — destroy the droplet when you're done.
#
# Usage (on the droplet):
#   ./build-droplet.sh
#
# Environment:
#   VNC_PORT       RFB port (default: 5900)
#   SCREEN_SIZE    Xvfb geometry (default: 1280x720x24)
set -euo pipefail

VNC_PORT="${VNC_PORT:-5900}"
SCREEN_SIZE="${SCREEN_SIZE:-1280x720x24}"

if [[ $EUID -ne 0 ]]; then
  echo "FATAL: run as root" >&2
  exit 2
fi

# ── Wait for cloud-init and apt lock ─────────────────────────
echo "── Waiting for cloud-init and apt lock"
cloud-init status --wait || true
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
  echo "Waiting for apt lock..."
  sleep 5
done

# ── Install desktop packages ─────────────────────────────────
echo "── Installing desktop packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq xvfb x11vnc xfce4 xfce4-terminal thunar dbus-x11 \
  fonts-noto-core xterm firefox ffmpeg

# ── Generate VNC password ────────────────────────────────────
# (openssl instead of tr</dev/urandom|head: the latter dies of SIGPIPE
# under pipefail. Note RFB auth only uses the first 8 characters.)
VNC_PASSWORD="$(openssl rand -hex 8)"

# ── Hardening ────────────────────────────────────────────────
# The desktop session runs as root: any stray click on the XFCE panel's
# action buttons (or Applications → Log Out → Restart) can reboot the VM
# mid-test without a polkit prompt. Mask the power targets so no UI path
# can take the machine down, and stop background package churn.
# (To reboot the droplet intentionally: unmask first, or power-cycle
# from the DigitalOcean panel.)
echo "── Hardening (power targets + package churn)"
systemctl mask reboot.target poweroff.target halt.target suspend.target >/dev/null 2>&1 || true
systemctl disable --now unattended-upgrades packagekit >/dev/null 2>&1 || true

# xfce4 pulls in lightdm; after a reboot it grabs :0 with a real Xorg
# (auth-protected, no -ac) and Xvfb/x11vnc can no longer claim the display.
systemctl disable --now lightdm >/dev/null 2>&1 || true

# ── Desktop service (survives reboots, same password) ────────
echo "── Installing desktop service"
cat > /usr/local/bin/claude-kvm-desktop.sh << EOF
#!/bin/sh
rm -f /tmp/.X0-lock /tmp/.X11-unix/X0
Xvfb :0 -screen 0 $SCREEN_SIZE -ac &
sleep 2
DISPLAY=:0 dbus-launch startxfce4 &
sleep 3
exec x11vnc -display :0 -forever -shared -passwd $VNC_PASSWORD -rfbport $VNC_PORT
EOF
chmod 700 /usr/local/bin/claude-kvm-desktop.sh

cat > /etc/systemd/system/claude-kvm-desktop.service << 'EOF'
[Unit]
Description=Claude KVM test desktop (Xvfb + XFCE + x11vnc)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/claude-kvm-desktop.sh
ExecStopPost=/usr/bin/pkill -f startxfce4
ExecStopPost=/usr/bin/pkill Xvfb
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Clean slate: kill any previous desktop, then start via systemd
pkill -f 'x11vnc.*:0' 2>/dev/null || true
pkill -f startxfce4 2>/dev/null || true
pkill Xvfb 2>/dev/null || true
sleep 1
systemctl daemon-reload
systemctl enable --now claude-kvm-desktop.service
sleep 8

# ── Health check ─────────────────────────────────────────────
if ! ss -ltn "sport = :$VNC_PORT" | grep -q LISTEN; then
  echo "FATAL: x11vnc is not listening on port $VNC_PORT" >&2
  echo "       journalctl -u claude-kvm-desktop -n 50" >&2
  exit 1
fi

# ── Recording helpers (same recipe as CI) ────────────────────
cat > /usr/local/bin/start-recording.sh << EOF
#!/bin/sh
nohup ffmpeg -video_size ${SCREEN_SIZE%x*} -framerate 10 -f x11grab -i :0 \\
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p \\
  /tmp/recording.mp4 > /tmp/ffmpeg.log 2>&1 &
echo \$! > /tmp/ffmpeg.pid
echo "Recording → /tmp/recording.mp4"
EOF
cat > /usr/local/bin/stop-recording.sh << 'EOF'
#!/bin/sh
kill -INT "$(cat /tmp/ffmpeg.pid 2>/dev/null)" 2>/dev/null
sleep 3
echo "Recording stopped: /tmp/recording.mp4"
EOF
chmod +x /usr/local/bin/start-recording.sh /usr/local/bin/stop-recording.sh

# ── Connection info ──────────────────────────────────────────
PUBLIC_IP="$(curl -s --max-time 5 https://get.phantom.tc/ip || hostname -I | awk '{print $1}')"

echo
echo "═══════════════════════════════════════════════════════"
echo " Desktop ready — paste into test/slow/.env"
echo " (or store as CI secrets):"
echo
echo "VNC_HOST=$PUBLIC_IP"
echo "VNC_PORT=$VNC_PORT"
echo "VNC_PASSWORD=$VNC_PASSWORD"
echo
echo " Desktop service:  systemctl status claude-kvm-desktop"
echo " Recording:        start-recording.sh / stop-recording.sh"
echo "═══════════════════════════════════════════════════════"
