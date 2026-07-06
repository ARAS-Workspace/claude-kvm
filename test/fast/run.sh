#!/bin/bash
# SPDX-License-Identifier: MIT
# Deterministic input test: build the x11vnc capture container, drive the
# daemon over PC/NDJSON, and compare what the target actually received.
#
# Usage:
#   run.sh [daemon-binary]
#
# Environment:
#   VNC_PORT   host port mapped to the container's 5900 (default: 5901)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DAEMON_BIN="${1:-$REPO_ROOT/.build/DerivedData/Build/Products/Release/claude-kvm-daemon}"
VNC_PORT="${VNC_PORT:-5901}"
CONTAINER="claude-kvm-input-test"
IMAGE="claude-kvm-input-test"

# Test corpus: each non-empty line is typed followed by Return.
CORPUS="$SCRIPT_DIR/corpus.txt"

if [[ ! -x "$DAEMON_BIN" ]]; then
  echo "FATAL: daemon binary not found at $DAEMON_BIN" >&2
  echo "Build it first: xcodebuild -project Claude-KVM-Daemon.xcodeproj -scheme claude-kvm-daemon -configuration Release -derivedDataPath .build/DerivedData build" >&2
  exit 2
fi

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "── Building container image"
docker build -q -t "$IMAGE" "$SCRIPT_DIR"

echo "── Starting container (VNC on localhost:$VNC_PORT)"
docker run -d --rm --name "$CONTAINER" -p "$VNC_PORT:5900" "$IMAGE" >/dev/null

# docker-proxy accepts on the host port before x11vnc listens inside the
# container, so probe the container log for x11vnc's readiness line instead.
# grep reads to EOF (no -q): with pipefail, -q would SIGPIPE `docker logs`
# and turn a successful match into a failed pipeline.
vnc_ready() { docker logs "$CONTAINER" 2>&1 | grep 'PORT=5900' >/dev/null; }
echo "── Waiting for x11vnc"
for _ in $(seq 1 30); do
  if vnc_ready; then break; fi
  sleep 1
done
vnc_ready || { echo "FATAL: x11vnc never became ready" >&2; exit 2; }
sleep 1

echo "── Driving daemon: $DAEMON_BIN"
python3 "$SCRIPT_DIR/driver.py" "$DAEMON_BIN" 127.0.0.1 "$VNC_PORT" "$CORPUS"

echo "── Comparing received vs expected"
RECEIVED="$(docker exec "$CONTAINER" cat /tmp/typed.txt)"

EXPECTED="$(grep -v '^$' "$CORPUS")"

echo
echo "expected:"
printf '%s\n' "$EXPECTED" | sed 's/^/  | /'
echo "received:"
printf '%s\n' "$RECEIVED" | sed 's/^/  | /'
echo

if [[ "$RECEIVED" == "$EXPECTED" ]]; then
  echo "PASS — all lines received verbatim"
  exit 0
else
  echo "FAIL — received text differs from expected"
  diff <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$RECEIVED") | sed 's/^/  /' || true
  exit 1
fi