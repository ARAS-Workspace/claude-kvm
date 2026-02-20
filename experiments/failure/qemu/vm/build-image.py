#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""
Build Alpine aarch64 QCOW2 image with XFCE desktop for CI testing.

Downloads Alpine ISO, installs to QCOW2 via QEMU serial console,
configures desktop + auto-login, then shuts down.

Usage: python3 build-image.py [output.qcow2]
"""

import logging
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("build")

ALPINE_VERSION = "3.21"
ALPINE_RELEASE = "3.21.3"
ALPINE_ISO_URL = f"https://dl-cdn.alpinelinux.org/alpine/v{ALPINE_VERSION}/releases/aarch64/alpine-virt-{ALPINE_RELEASE}-aarch64.iso"
ALPINE_ISO = "alpine-virt.iso"

OUTPUT_QCOW2 = sys.argv[1] if len(sys.argv) > 1 else "alpine-desktop.qcow2"
DISK_SIZE = "4G"
MEMORY = "2048"

SERIAL_SOCK = "/tmp/qemu-serial.sock"
MONITOR_SOCK = "/tmp/qemu-monitor.sock"

UEFI_CODE = "/opt/homebrew/share/qemu/edk2-aarch64-code.fd"
UEFI_VARS_TEMPLATE = "/opt/homebrew/share/qemu/edk2-arm-vars.fd"
UEFI_VARS = "/tmp/uefi-vars.fd"


class Serial:
    def __init__(self, path, timeout=1):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(path)
        self.sock.settimeout(timeout)
        self.buf = b""

    def read_until(self, pattern, timeout=300):
        if isinstance(pattern, str):
            pattern = pattern.encode()
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                data = self.sock.recv(4096)
                if data:
                    self.buf += data
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                    if pattern in self.buf:
                        self.buf = b""
                        return True
            except socket.timeout:
                continue
        raise TimeoutError(f"Timeout waiting for: {pattern}")

    def send(self, text):
        self.sock.sendall((text + "\n").encode())
        time.sleep(0.3)

    def cmd(self, command, prompt="~#", timeout=300):
        self.send(command)
        self.read_until(prompt, timeout)

    def close(self):
        self.sock.close()


def monitor_cmd(cmd):
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(MONITOR_SOCK)
    sock.settimeout(2)
    time.sleep(0.5)
    try:
        sock.recv(4096)
    except socket.timeout:
        pass
    sock.sendall((cmd + "\n").encode())
    time.sleep(0.5)
    try:
        resp = sock.recv(4096).decode()
    except socket.timeout:
        resp = ""
    sock.close()
    return resp


def download_iso():
    if os.path.exists(ALPINE_ISO):
        log.info("ISO exists: %s", ALPINE_ISO)
        return
    log.info("Downloading %s", ALPINE_ISO_URL)
    urllib.request.urlretrieve(ALPINE_ISO_URL, ALPINE_ISO)
    log.info("Downloaded: %d bytes", os.path.getsize(ALPINE_ISO))


def create_disk():
    if os.path.exists(OUTPUT_QCOW2):
        os.remove(OUTPUT_QCOW2)
    subprocess.run(["qemu-img", "create", "-f", "qcow2", OUTPUT_QCOW2, DISK_SIZE], check=True)


def start_qemu(cdrom=None):
    for sock in [SERIAL_SOCK, MONITOR_SOCK]:
        if os.path.exists(sock):
            os.remove(sock)

    shutil.copy2(UEFI_VARS_TEMPLATE, UEFI_VARS)

    cmd = [
        "qemu-system-aarch64",
        "-machine", "virt",
        "-cpu", "cortex-a72",
        "-m", MEMORY,
        "-smp", "2",
        "-accel", "tcg",
        "-drive", f"if=pflash,format=raw,readonly=on,file={UEFI_CODE}",
        "-drive", f"if=pflash,format=raw,file={UEFI_VARS}",
        "-drive", f"file={OUTPUT_QCOW2},if=virtio,format=qcow2",
        "-device", "virtio-net-pci,netdev=net0",
        "-netdev", "user,id=net0",
        "-serial", f"unix:{SERIAL_SOCK},server,nowait",
        "-monitor", f"unix:{MONITOR_SOCK},server,nowait",
        "-display", "none",
        "-daemonize",
    ]
    if cdrom:
        cmd.extend(["-cdrom", cdrom])

    log.info("Starting QEMU: %s", " ".join(cmd))
    subprocess.run(cmd, check=True)
    time.sleep(2)


def wait_for_socket(path, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.path.exists(path):
            return
        time.sleep(0.5)
    raise TimeoutError(f"Socket not created: {path}")


def phase1_install():
    """Boot from ISO and install Alpine to disk."""
    log.info("=== Phase 1: Install Alpine to disk ===")
    start_qemu(cdrom=ALPINE_ISO)
    wait_for_socket(SERIAL_SOCK)

    s = Serial(SERIAL_SOCK)

    log.info("Waiting for login prompt...")
    s.read_until("login:", timeout=300)
    s.send("root")
    s.read_until("~#", timeout=30)
    log.info("Logged in")

    log.info("Setting up network and DNS...")
    s.cmd("ip link set eth0 up", timeout=30)
    s.cmd("udhcpc -i eth0", timeout=60)
    s.cmd("echo 'nameserver 8.8.8.8' > /etc/resolv.conf", timeout=10)

    log.info("Persisting network config for installed system...")
    s.cmd("mkdir -p /etc/network", timeout=10)
    s.cmd("printf 'auto lo\\niface lo inet loopback\\n\\nauto eth0\\niface eth0 inet dhcp\\n' > /etc/network/interfaces", timeout=10)

    log.info("Writing apk repositories...")
    s.cmd(f"echo 'https://dl-cdn.alpinelinux.org/alpine/v{ALPINE_VERSION}/main' > /etc/apk/repositories", timeout=10)
    s.cmd(f"echo 'https://dl-cdn.alpinelinux.org/alpine/v{ALPINE_VERSION}/community' >> /etc/apk/repositories", timeout=10)
    s.cmd("apk update", timeout=120)

    log.info("Running setup-disk...")
    s.send("echo y | setup-disk -m sys /dev/vda")
    s.read_until("~#", timeout=600)
    log.info("Disk setup complete")

    log.info("Powering off...")
    s.send("poweroff")
    time.sleep(15)
    s.close()

    try:
        monitor_cmd("quit")
    except (ConnectionRefusedError, FileNotFoundError):
        pass
    time.sleep(3)


def phase2_configure():
    """Boot from disk and install desktop + auto-login."""
    log.info("=== Phase 2: Configure desktop ===")
    start_qemu()
    wait_for_socket(SERIAL_SOCK)

    s = Serial(SERIAL_SOCK)

    log.info("Waiting for login prompt...")
    s.read_until("login:", timeout=300)
    s.send("root")
    s.read_until("~#", timeout=30)

    log.info("Setting up network and DNS...")
    s.cmd("ip link set eth0 up", timeout=30)
    s.cmd("udhcpc -i eth0", timeout=60)
    s.cmd("echo 'nameserver 8.8.8.8' > /etc/resolv.conf", timeout=10)
    s.cmd("rc-update add networking boot", timeout=30)

    log.info("Installing Xvfb, x11vnc, and desktop packages...")
    s.cmd("apk update", timeout=120)
    s.cmd("apk add xorg-server x11vnc xfce4 xfce4-terminal thunar dbus font-noto", timeout=900)

    log.info("Configuring services...")
    s.cmd("rc-update add dbus")
    s.cmd("rc-update add local default")

    log.info("Verifying binaries...")
    s.cmd("which Xvfb || echo 'MISSING: Xvfb'")
    s.cmd("which x11vnc || echo 'MISSING: x11vnc'")

    log.info("Creating desktop startup script...")
    s.cmd("echo '#!/bin/sh' > /etc/local.d/desktop.start")
    s.cmd("echo 'exec > /dev/ttyAMA0 2>&1' >> /etc/local.d/desktop.start")
    s.cmd("echo 'echo [desktop] Starting Xvfb...' >> /etc/local.d/desktop.start")
    s.cmd("echo 'export DISPLAY=:0' >> /etc/local.d/desktop.start")
    s.cmd("echo 'Xvfb :0 -screen 0 1280x720x24 -ac &' >> /etc/local.d/desktop.start")
    s.cmd("echo 'sleep 2' >> /etc/local.d/desktop.start")
    s.cmd("echo 'echo [desktop] Starting XFCE...' >> /etc/local.d/desktop.start")
    s.cmd("echo 'dbus-launch startxfce4 &' >> /etc/local.d/desktop.start")
    s.cmd("echo 'sleep 3' >> /etc/local.d/desktop.start")
    s.cmd("echo 'echo [desktop] Starting x11vnc...' >> /etc/local.d/desktop.start")
    s.cmd("echo 'x11vnc -display :0 -forever -nopw -listen 0.0.0.0 -rfbport 5900 &' >> /etc/local.d/desktop.start")
    s.cmd("echo 'echo [desktop] Done' >> /etc/local.d/desktop.start")
    s.cmd("chmod +x /etc/local.d/desktop.start")
    s.cmd("cat /etc/local.d/desktop.start")

    log.info("Setting root password (empty)...")
    s.cmd("passwd -d root")

    log.info("Powering off...")
    s.send("poweroff")
    time.sleep(10)
    s.close()

    try:
        monitor_cmd("quit")
    except (ConnectionRefusedError, FileNotFoundError):
        pass
    time.sleep(3)


def main():
    log.info("Output: %s", OUTPUT_QCOW2)
    download_iso()
    create_disk()
    phase1_install()
    phase2_configure()
    size = os.path.getsize(OUTPUT_QCOW2)
    log.info("Done! %s: %.1f MB", OUTPUT_QCOW2, size / 1024 / 1024)


if __name__ == "__main__":
    main()
