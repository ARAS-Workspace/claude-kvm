# Daemon Tests

Two tiers, both exercising the daemon built from this branch's source.

## `test/fast` — deterministic input verification

No LLM, no OCR. An xterm on the VNC target runs `cat > /tmp/typed.txt`,
capturing every keystroke the daemon delivers. `driver.py` speaks the
daemon's PC/NDJSON protocol directly, types each line of `corpus.txt`
followed by Return, and the result is compared byte-for-byte.

Local run (Docker + x11vnc container):

```bash
xcodebuild -project Claude-KVM-Daemon.xcodeproj -scheme claude-kvm-daemon \
  -configuration Release -derivedDataPath .build/DerivedData build
test/fast/run.sh
```

Covers uppercase (issue #9), lowercase, mixed case, shifted symbols,
digits and spaces. Extend by adding lines to `corpus.txt`.

## `test/slow` — agentic E2E (Executor + Observer)

The main branch's integration test adapted to this branch: Claude
(Executor) drives the desktop over MCP, Qwen-VL (Observer) verifies the
screen. The MCP layer comes from the published `claude-kvm` npm package;
the daemon under test is injected via `CLAUDE_KVM_DAEMON_PATH`.

```bash
cd test/slow
npm ci
cp .env.example .env   # fill in API keys
node integration.js
```

## CI

`.github/workflows/integration-test.yml` builds the daemon from source,
provisions a DigitalOcean droplet (Xvfb + XFCE + x11vnc), tunnels VNC over
SSH, runs the fast test, then optionally the slow test, and uploads a full
screen recording as an artifact.