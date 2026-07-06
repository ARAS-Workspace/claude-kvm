#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""
Deterministic input driver for the claude-kvm daemon.

Spawns the daemon, speaks PC (NDJSON) over stdin/stdout, clicks screen
center to focus the capture xterm, types each corpus line followed by
Return, then shuts down. No LLM, no OCR — the target side captures what
actually arrived via `cat > /tmp/typed.txt`.

Usage:
    driver.py <daemon-binary> <host> <port> <corpus-file> [password]
"""

import json
import pathlib
import queue
import subprocess
import sys
import threading


def main() -> int:
    if len(sys.argv) not in (5, 6):
        print(__doc__, file=sys.stderr)
        return 2

    daemon_bin, host, port, corpus = sys.argv[1:5]
    lines = [l for l in pathlib.Path(corpus).read_text().splitlines() if l]

    args = [daemon_bin, "--host", host, "--port", port]
    if len(sys.argv) == 6:
        args += ["--password", sys.argv[5]]

    proc = subprocess.Popen(
        args,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    messages: "queue.Queue[dict]" = queue.Queue()

    def reader() -> None:
        assert proc.stdout is not None
        for raw in proc.stdout:
            raw = raw.strip()
            if not raw:
                continue
            try:
                messages.put(json.loads(raw))
            except json.JSONDecodeError:
                print(f"[driver] unparseable line: {raw[:200]}", file=sys.stderr)

    threading.Thread(target=reader, daemon=True).start()

    def wait_for(pred, timeout: float = 30.0) -> dict:
        while True:
            msg = messages.get(timeout=timeout)
            if pred(msg):
                return msg

    next_id = 0

    def call(method: str, params: dict | None = None) -> dict:
        nonlocal next_id
        next_id += 1
        req: dict = {"method": method, "id": next_id}
        if params:
            req["params"] = params
        assert proc.stdin is not None
        proc.stdin.write(json.dumps(req) + "\n")
        proc.stdin.flush()
        resp = wait_for(lambda m: m.get("id") == next_id)
        if "error" in resp:
            raise RuntimeError(f"{method} failed: {resp['error']}")
        print(f"[driver] {method} → OK", file=sys.stderr)
        return resp

    try:
        ready = wait_for(lambda m: m.get("method") == "ready")
        dims = ready.get("params", {})
        print(f"[driver] ready — {dims.get('scaledWidth')}×{dims.get('scaledHeight')}", file=sys.stderr)

        # Focus the capture xterm (PointerRoot focus: keyboard follows pointer).
        call("mouse_click", {"x": 640, "y": 360})
        call("wait", {"ms": 500})

        for line in lines:
            call("key_type", {"text": line})
            call("key_tap", {"key": "return"})
            call("wait", {"ms": 200})

        call("shutdown")
        proc.wait(timeout=10)
        return 0
    except Exception as exc:  # noqa: BLE001 — report any failure and clean up
        print(f"[driver] FAILED: {exc}", file=sys.stderr)
        proc.kill()
        return 1


if __name__ == "__main__":
    sys.exit(main())