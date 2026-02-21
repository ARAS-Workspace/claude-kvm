#!/usr/bin/env python3
"""Start/stop screen recording on remote Mac via SSH control socket."""

import subprocess
import sys
import time

SSH_CMD = ["ssh", "-S", "/tmp/mac_ssh", "placeholder"]


def ssh(cmd, check=False):
    """Run command on remote Mac via control socket."""
    r = subprocess.run(SSH_CMD + [cmd], capture_output=True, text=True, timeout=30)
    if check and r.returncode != 0:
        print(f"SSH error: {r.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


def start():
    uid = ssh("id -u", check=True)

    # Start ffmpeg in GUI session context via launchctl
    ssh(
        f"sudo launchctl asuser {uid} bash -c '"
        "ffmpeg -f avfoundation -capture_cursor 1 -framerate 10 "
        "-i 0:none -c:v libx264 -preset ultrafast -pix_fmt yuv420p "
        "/tmp/recording.mp4 </dev/null >/tmp/ffmpeg.log 2>&1 & "
        "echo $! > /tmp/ffmpeg.pid; disown"
        "'"
    )

    time.sleep(3)

    pid = ssh("cat /tmp/ffmpeg.pid 2>/dev/null")
    if not pid:
        print("ERROR: No PID file", file=sys.stderr)
        sys.exit(1)

    alive = ssh(f"kill -0 {pid} 2>/dev/null && echo yes || echo no")
    if alive == "yes":
        print(f"Recording started (PID {pid})")
    else:
        log = ssh("cat /tmp/ffmpeg.log 2>/dev/null")
        print(f"Recording failed. ffmpeg log:\n{log}", file=sys.stderr)
        sys.exit(1)


def stop():
    pid = ssh("cat /tmp/ffmpeg.pid 2>/dev/null")
    if pid:
        ssh(f"kill -INT {pid} 2>/dev/null; sleep 2")
        print(f"Recording stopped (PID {pid})")
    else:
        print("No recording PID found")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "start"
    if action == "start":
        start()
    elif action == "stop":
        stop()
    else:
        print(f"Usage: {sys.argv[0]} [start|stop]", file=sys.stderr)
        sys.exit(1)
