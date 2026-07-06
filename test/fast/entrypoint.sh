#!/bin/sh
# SPDX-License-Identifier: MIT
set -e

Xvfb :0 -screen 0 1280x720x24 -ac &
sleep 2

# No window manager: X focus is PointerRoot, so keyboard events go to the
# window under the pointer. The harness clicks screen center first; the
# xterm geometry below covers that point.
DISPLAY=:0 xterm -geometry 220x50+0+0 -e /bin/sh -c 'cat > /tmp/typed.txt' &
sleep 1

exec x11vnc -display :0 -forever -shared -nopw -rfbport 5900