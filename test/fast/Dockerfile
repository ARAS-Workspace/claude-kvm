# SPDX-License-Identifier: MIT
# Claude KVM — deterministic input test target.
# Xvfb + x11vnc + xterm running `cat > /tmp/typed.txt`:
# every line typed over VNC is captured verbatim for byte-level comparison.
FROM debian:trixie-slim

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends xvfb x11vnc xterm && \
    rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5900
ENTRYPOINT ["/entrypoint.sh"]