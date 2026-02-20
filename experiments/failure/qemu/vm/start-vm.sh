#!/bin/bash
# SPDX-License-Identifier: MIT
# Start Alpine QCOW2 VM headless with x11vnc port forwarding.
#
# Usage: ./start-vm.sh [qcow2-path] [host-vnc-port]
# Example: ./start-vm.sh alpine-desktop.qcow2 5900

set -e

QCOW2="${1:-alpine-desktop.qcow2}"
VNC_PORT="${2:-5900}"

UEFI_CODE="/opt/homebrew/share/qemu/edk2-aarch64-code.fd"
UEFI_VARS_TEMPLATE="/opt/homebrew/share/qemu/edk2-arm-vars.fd"
UEFI_VARS="/tmp/uefi-vars-run.fd"

if [ ! -f "$QCOW2" ]; then
  echo "Error: $QCOW2 not found"
  exit 1
fi

cp "$UEFI_VARS_TEMPLATE" "$UEFI_VARS"

echo "[vm] Starting QEMU headless, forwarding guest x11vnc :5900 → host :${VNC_PORT}"
qemu-system-aarch64 \
  -machine virt \
  -cpu cortex-a72 \
  -m 2048 \
  -smp 2 \
  -accel tcg \
  -drive if=pflash,format=raw,readonly=on,file="$UEFI_CODE" \
  -drive if=pflash,format=raw,file="$UEFI_VARS" \
  -drive file="$QCOW2",if=virtio,format=qcow2 \
  -device virtio-net-pci,netdev=net0 \
  -netdev user,id=net0,hostfwd=tcp::${VNC_PORT}-:5900 \
  -serial file:/tmp/vm-console.log \
  -display none \
  -daemonize

echo "[vm] QEMU started, VNC available on port ${VNC_PORT} (via x11vnc)"
