#!/bin/bash
# SPDX-License-Identifier: MIT
# Agentic slow test runner — droplet-independent.
#
# Runs the Executor+Observer integration test against whatever VNC target
# is configured (VNC_HOST/VNC_PORT via environment or test/slow/.env).
# The daemon under test is the from-source build of this branch.
# Screenshots land in a per-run directory and are the visual record.
#
# Usage:
#   run.sh
#
# Environment (or .env in this directory):
#   ANTHROPIC_API_KEY         required
#   OPENROUTER_API_KEY        optional — observer verify() disabled without it
#   VNC_HOST / VNC_PORT       VNC target (default: 127.0.0.1:5900)
#   CLAUDE_KVM_DAEMON_PATH    daemon binary (default: this branch's Release build)
#   SCREENSHOTS_DIR           override the per-run screenshot directory
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$SCRIPT_DIR"

# .env (if present) fills in anything not already exported
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DAEMON_BIN="${CLAUDE_KVM_DAEMON_PATH:-$REPO_ROOT/.build/DerivedData/Build/Products/Release/claude-kvm-daemon}"
RUN_STAMP="$(date +%Y%m%d-%H%M%S)"
SCREENSHOTS_DIR="${SCREENSHOTS_DIR:-$SCRIPT_DIR/test-screenshots/run-$RUN_STAMP}"

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "FATAL: ANTHROPIC_API_KEY is not set (export it or put it in test/slow/.env)" >&2
  exit 2
fi

if [[ ! -x "$DAEMON_BIN" ]]; then
  echo "FATAL: daemon binary not found at $DAEMON_BIN" >&2
  echo "Build it first: xcodebuild -project Claude-KVM-Daemon.xcodeproj -scheme claude-kvm-daemon -configuration Release -derivedDataPath .build/DerivedData build" >&2
  exit 2
fi

if [[ ! -d node_modules ]]; then
  echo "── Installing dependencies"
  npm ci --no-audit --no-fund
fi

mkdir -p "$SCREENSHOTS_DIR"

echo "── VNC target:  ${VNC_HOST:-127.0.0.1}:${VNC_PORT:-5900}"
echo "── Daemon:      $DAEMON_BIN"
echo "── Screenshots: $SCREENSHOTS_DIR"
echo

STATUS=0
CLAUDE_KVM_DAEMON_PATH="$DAEMON_BIN" \
SCREENSHOTS_DIR="$SCREENSHOTS_DIR" \
node integration.js || STATUS=$?

echo
echo "── Visual record: $(find "$SCREENSHOTS_DIR" -name '*.png' 2>/dev/null | wc -l | tr -d ' ') screenshot(s) in $SCREENSHOTS_DIR"
exit $STATUS