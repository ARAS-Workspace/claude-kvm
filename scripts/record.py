#!/usr/bin/env python3
"""Start/stop screen recording on remote Mac via SSH control socket."""

import subprocess
import sys
import time

SSH_CMD = ["ssh", "-S", "/tmp/mac_ssh", "placeholder"]
FFMPEG = "/opt/homebrew/bin/ffmpeg"


def ssh(cmd, check=False):
    """Run command on remote Mac via control socket."""
    r = subprocess.run(SSH_CMD + [cmd], capture_output=True, text=True, timeout=30)
    if check and r.returncode != 0:
        print(f"SSH error: {r.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


def start():
    # Kill any previous screen session
    ssh("screen -S recording -X quit 2>/dev/null")
    ssh("rm -f /tmp/ffmpeg.pid /tmp/recording.mp4 /tmp/ffmpeg.log")

    # Start ffmpeg in a detached screen session
    ssh(
        f"screen -dmS recording {FFMPEG} "
        "-f avfoundation -capture_cursor 1 -framerate 10 "
        "-i 0:none -c:v libx264 -preset ultrafast "
        "/tmp/recording.mp4"
    )

    time.sleep(3)

    # Verify screen session is alive
    alive = ssh("screen -ls | grep -q recording && echo yes || echo no")
    if alive == "yes":
        print("Recording started (screen session: recording)")
    else:
        log = ssh("cat /tmp/ffmpeg.log 2>/dev/null")
        print(f"Recording failed. Log:\n{log}", file=sys.stderr)
        sys.exit(1)


def stop():
    # Send q to ffmpeg for graceful stop
    ssh("screen -S recording -X stuff 'q' 2>/dev/null")
    time.sleep(3)
    # Force kill if still alive
    ssh("screen -S recording -X quit 2>/dev/null")
    print("Recording stopped")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "start"
    if action == "start":
        start()
    elif action == "stop":
        stop()
    else:
        print(f"Usage: {sys.argv[0]} [start|stop]", file=sys.stderr)
        sys.exit(1)
