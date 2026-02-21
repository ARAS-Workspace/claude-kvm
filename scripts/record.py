#!/usr/bin/env python3
"""Start/stop QuickTime screen recording on remote Mac via SSH."""

import subprocess
import sys
import time

SSH_CMD = ["ssh", "-S", "/tmp/mac_ssh", "placeholder"]

START_SCRIPT = """
tell application "QuickTime Player"
    activate
    set newRec to new screen recording
    start newRec
end tell
"""

STOP_SCRIPT = """
tell application "QuickTime Player"
    stop (document 1)
    delay 2
    export document 1 in (POSIX file "/tmp/recording.mov") using settings preset "480p"
    delay 1
    close document 1 saving no
    quit
end tell
"""


def ssh(cmd, check=False):
    r = subprocess.run(SSH_CMD + [cmd], capture_output=True, text=True, timeout=60)
    if check and r.returncode != 0:
        print(f"SSH error: {r.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


def start():
    ssh("rm -f /tmp/recording.mov")
    result = ssh(f"osascript -e '{START_SCRIPT}'")
    time.sleep(2)
    alive = ssh("pgrep -x 'QuickTime Player' >/dev/null && echo yes || echo no")
    if alive == "yes":
        print("QuickTime screen recording started")
    else:
        print(f"Recording failed: {result}", file=sys.stderr)
        sys.exit(1)


def stop():
    result = ssh(f"osascript -e '{STOP_SCRIPT}'")
    if result:
        print(result)
    print("QuickTime recording stopped and exported")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "start"
    if action == "start":
        start()
    elif action == "stop":
        stop()
    else:
        print(f"Usage: {sys.argv[0]} [start|stop]", file=sys.stderr)
        sys.exit(1)
