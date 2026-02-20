#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Converts CI test logs to asciinema v2 .cast format.
 *
 * Usage: cat test-logs.txt | node logs-to-cast.js [speed] > demo.cast
 *   speed — playback multiplier (default: 4)
 *
 * Input:  lines matching [HH:MM:SS] [TAG] message
 * Output: asciinema v2 cast (NDJSON) to stdout
 */

import { createInterface } from 'node:readline';
import { argv, stdin, stderr, exit } from 'node:process';

const speed = parseFloat(argv[2] || '4');
const COLS = 120;
const ROWS = 35;
const SKIP = new Set(['SAVE']);
const MAX_LINE = 160;

// ── Parse ────────────────────────────────────────────────

const rl = createInterface({ input: stdin });
const lines = [];
rl.on('line', l => lines.push(l));

rl.on('close', () => {
  const events = [];
  let firstTime = null;
  let lastSecond = -1;
  let subIndex = 0;

  for (const line of lines) {
    const m = line.match(/\[(\d{2}):(\d{2}):(\d{2})]\s+\[([A-Z][-A-Z]*)]\s+(.*)/);
    if (!m) continue;

    const [, h, min, s, tag, msg] = m;
    if (SKIP.has(tag)) continue;

    const seconds = parseInt(h) * 3600 + parseInt(min) * 60 + parseInt(s);
    if (firstTime === null) firstTime = seconds;

    // Delta from start (handle midnight wrap)
    let delta = seconds - firstTime;
    if (delta < 0) delta += 86400;

    // Small offset for same-second events
    if (delta === lastSecond) {
      subIndex++;
    } else {
      subIndex = 0;
      lastSecond = delta;
    }
    delta += subIndex * 0.12;

    // Apply speed
    delta /= speed;

    // Plain text — no color, direct log feel
    let text = msg;
    if (text.length > MAX_LINE) text = text.slice(0, MAX_LINE) + '\u2026';

    events.push([
      parseFloat(delta.toFixed(3)),
      'o',
      `[${tag}] ${text}\r\n`,
    ]);
  }

  if (events.length === 0) {
    stderr.write('Error: no matching log lines found\n');
    exit(1);
  }

  // Header
  console.log(JSON.stringify({
    version: 2,
    width: COLS,
    height: ROWS,
    timestamp: Math.floor(Date.now() / 1000),
    title: 'Claude KVM \u2014 Integration Test',
    env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
  }));

  // Events
  for (const ev of events) console.log(JSON.stringify(ev));

  const duration = events[events.length - 1][0];
  stderr.write(`Cast: ${events.length} events, ${duration.toFixed(1)}s (${speed}x from ${(duration * speed).toFixed(0)}s real)\n`);
});