#!/usr/bin/env python3
"""Start/stop screen recording on remote Mac via osascript + Terminal.app."""

import subprocess
import sys
import time

SSH_CMD = ["ssh", "-S", "/tmp/mac_ssh", "placeholder"]

FFMPEG = "/opt/homebrew/bin/ffmpeg"
OUTPUT = "/tmp/recording.mp4"


def ssh(cmd, check=False):
    r = subprocess.run(SSH_CMD + [cmd], capture_output=True, text=True, timeout=30)
    if check and r.returncode != 0:
        print(f"SSH error: {r.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


def start():
    # Cleanup previous
    ssh(f"kill $(pgrep -f avfoundation) 2>/dev/null; rm -f {OUTPUT}")

    # Launch ffmpeg inside Terminal.app via osascript (GUI session context)
    ssh(
        "osascript -e 'tell application \"Terminal\" to do script "
        f"\"{FFMPEG} -f avfoundation -capture_cursor 1 -framerate 10 "
        f"-i '\\''0:none'\\'' -c:v libx264 -preset ultrafast {OUTPUT}\"'"
    )

    time.sleep(3)

    alive = ssh("pgrep -f avfoundation >/dev/null && echo yes || echo no")
    if alive == "yes":
        print("Recording started")
    else:
        print("Recording failed", file=sys.stderr)
        sys.exit(1)


def stop():
    ssh("kill -INT $(pgrep -f avfoundation) 2>/dev/null")
    time.sleep(3)

    size = ssh(f"stat -f%z {OUTPUT} 2>/dev/null")
    if size and int(size) > 0:
        print(f"Recording stopped ({int(size) // 1024}KB)")
    else:
        print("Recording stopped (no output file)")

    # Close Terminal window
    ssh("osascript -e 'tell application \"Terminal\" to close front window' 2>/dev/null")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "start"
    if action == "start":
        start()
    elif action == "stop":
        stop()
    else:
        print(f"Usage: {sys.argv[0]} [start|stop]", file=sys.stderr)
        sys.exit(1)
