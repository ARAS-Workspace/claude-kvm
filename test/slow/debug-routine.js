#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Agentic debug routine — deterministic, no LLM.
 *
 * Replays the exact traffic pattern of the agentic test through the FULL
 * stack (MCP proxy → daemon → VNC): wake-up queue, screenshots,
 * detect_elements, action_queue batches with key_type, and simulated
 * LLM "thinking" gaps between turns. Logs per-call latency and pinpoints
 * the first call that wedges.
 *
 * Usage:
 *   node debug-routine.js [rounds]      # default 5
 *
 * Environment: same as integration.js (.env is honored) —
 *   VNC_HOST/VNC_PORT/VNC_PASSWORD, CLAUDE_KVM_DAEMON_PATH
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { connectMCP } from './lib/mcp.js';
import { log } from './lib/log.js';

const ROUNDS = parseInt(process.argv[2] || '5', 10);
const THINK_MS = 5000; // simulated LLM gap between turns

let step = 0;

async function timed(label, fn) {
  step++;
  const t0 = Date.now();
  try {
    const result = await fn();
    const text = result?.content?.filter(c => c.type === 'text').map(c => c.text).join(' ') || '';
    const img = result?.content?.some(c => c.type === 'image') ? ' [image]' : '';
    log('STEP', `#${step} ${label} → ${Date.now() - t0}ms${img} ${text.slice(0, 80)}`);
    return result;
  } catch (err) {
    log('WEDGE', `#${step} ${label} FAILED after ${Date.now() - t0}ms: ${err.message}`);
    throw err;
  }
}

async function main() {
  const { mcp } = await connectMCP();

  // ── Exactly what integration.js does at INIT ──
  await timed('wake-up action_queue', () =>
    mcp.callTool({ name: 'action_queue', arguments: { actions: [
      { action: 'mouse_click', x: 640, y: 360 },
      { action: 'key_tap', key: 'space' },
      { action: 'wait', ms: 2000 },
    ]}}));

  await timed('initial screenshot', () =>
    mcp.callTool({ name: 'vnc_command', arguments: { action: 'screenshot' } }));
  await timed('initial detect_elements', () =>
    mcp.callTool({ name: 'vnc_command', arguments: { action: 'detect_elements' } }));

  // ── Simulated agent turns ──
  for (let r = 1; r <= ROUNDS; r++) {
    log('ROUND', `${r}/${ROUNDS} (think gap ${THINK_MS}ms)`);
    await sleep(THINK_MS);

    await timed(`r${r} click+wait queue`, () =>
      mcp.callTool({ name: 'action_queue', arguments: { actions: [
        { action: 'mouse_click', x: 640, y: 360 },
        { action: 'wait', ms: 1000 },
      ]}}));

    await sleep(THINK_MS);

    await timed(`r${r} screenshot`, () =>
      mcp.callTool({ name: 'vnc_command', arguments: { action: 'screenshot' } }));

    await sleep(THINK_MS);

    await timed(`r${r} type queue (10 actions)`, () =>
      mcp.callTool({ name: 'action_queue', arguments: { actions: [
        { action: 'mouse_click', x: 640, y: 360 },
        { action: 'wait', ms: 300 },
        { action: 'key_type', text: `echo ROUND ${r} TEST CASE ABC` },
        { action: 'wait', ms: 200 },
        { action: 'key_tap', key: 'return' },
        { action: 'wait', ms: 200 },
        { action: 'key_type', text: `echo Round ${r} MixedCase done` },
        { action: 'wait', ms: 200 },
        { action: 'key_tap', key: 'return' },
        { action: 'wait', ms: 300 },
      ]}}));

    await timed(`r${r} detect_elements`, () =>
      mcp.callTool({ name: 'vnc_command', arguments: { action: 'detect_elements' } }));
  }

  await timed('final screenshot', () =>
    mcp.callTool({ name: 'vnc_command', arguments: { action: 'screenshot' } }));

  log('DONE', `no wedge across ${ROUNDS} rounds — full stack healthy`);
  await mcp.close();
  process.exit(0);
}

main().catch(async err => {
  log('FATAL', err.message);
  process.exit(1);
});