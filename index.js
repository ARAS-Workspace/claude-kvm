// SPDX-License-Identifier: MIT
/**
 *  █████╗ ██████╗  █████╗ ███████╗
 * ██╔══██╗██╔══██╗██╔══██╗██╔════╝
 * ███████║██████╔╝███████║███████╗
 * ██╔══██║██╔══██╗██╔══██║╚════██║
 * ██║  ██║██║  ██║██║  ██║███████║
 * ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 *
 * Copyright (c) 2025 Rıza Emre ARAS <r.emrearas@proton.me>
 *
 * This file is part of Claude KVM.
 * Released under the MIT License — see LICENSE for details.
 */

import 'dotenv/config';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { VNCClient } from './lib/vnc.js';
import { HIDController } from './lib/hid.js';
import { ScreenCapture } from './lib/capture.js';
import { ClaudeClient } from './claude/client.js';
import { getToolDefinitions } from './claude/tools/index.js';

// ── Load Configuration ──────────────────────────────────────

/** @type {import('./lib/types.js').ClaudeKVMConfig} */
const config = parseYaml(readFileSync('config.yaml', 'utf-8'));

// ── Screenshot Saving (CI) ──────────────────────────────────

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || null;
let screenshotIndex = 0;

if (SCREENSHOTS_DIR) mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function saveScreenshot(base64, label) {
  if (!SCREENSHOTS_DIR) return;
  const name = `${String(++screenshotIndex).padStart(3, '0')}-${label}.png`;
  writeFileSync(`${SCREENSHOTS_DIR}/${name}`, Buffer.from(base64, 'base64'));
}

/** Read task from stdin (pipe) */
async function readTask() {
  if (process.stdin.isTTY) return 'Describe what you see on the screen.';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Display Scaling ─────────────────────────────────────────

/** Native resolution (from VNC) */
let native = { width: 0, height: 0 };
/** Scaled resolution (what Claude sees) */
let scaled = { width: 0, height: 0 };

/** Scale Claude's coordinates → native */
function toNative(x, y) {
  const sx = native.width / scaled.width;
  const sy = native.height / scaled.height;
  return { x: Math.round(x * sx), y: Math.round(y * sy) };
}

/** Scale native cursor position → Claude's coordinate space */
function toScaled(pos) {
  const sx = scaled.width / native.width;
  const sy = scaled.height / native.height;
  return { x: Math.round(pos.x * sx), y: Math.round(pos.y * sy) };
}

// ── Mouse Action Map ────────────────────────────────────────

/** @type {Record<string, (input: Record<string, any>, hid: HIDController) => Promise<void>>} */
const MOUSE_EXEC = {
  move:         async (i, h) => { const p = toNative(i.x, i.y); await h.mouseMove(p.x, p.y); },
  nudge:        async (i, h) => {
    const p = h.getCursorPosition();
    const sx = native.width / scaled.width;
    const sy = native.height / scaled.height;
    await h.mouseMove(
      Math.max(0, Math.min(native.width - 1, p.x + Math.round((i.dx || 0) * sx))),
      Math.max(0, Math.min(native.height - 1, p.y + Math.round((i.dy || 0) * sy))),
    );
  },
  click:        async (i, h) => { await h.mouseClick('left'); },
  click_at:     async (i, h) => { const p = toNative(i.x, i.y); await h.mouseMove(p.x, p.y); await h.mouseClick('left'); },
  right_click:  async (i, h) => { await h.mouseClick('right'); },
  double_click: async (i, h) => { await h.mouseDoubleClick(); },
  drag:         async (i, h) => { const p = toNative(i.x, i.y); await h.mouseDrag(p.x, p.y); },
  scroll:       async (i, h) => { await h.scroll(i.direction || 'down', i.amount || 3); },
  peek:         async () => {},
};

const CROP_ACTIONS = new Set(['move', 'nudge', 'peek']);
const CLICK_ACTIONS = new Set(['click', 'click_at', 'right_click', 'double_click']);

// ── Keyboard Action Map ─────────────────────────────────────

/** @type {Record<string, (input: Record<string, any>, hid: HIDController) => Promise<void>>} */
const KEYBOARD_EXEC = {
  press: async (i, h) => { await h.keyPress(i.key); },
  combo: async (i, h) => { await h.keyCombo(i.keys); },
  type:  async (i, h) => { await h.typeText(i.text); },
};

// ── Tool Executor ───────────────────────────────────────────

/**
 * @param {string} name
 * @param {Record<string, any>} input
 * @param {HIDController} hid
 * @param {ScreenCapture} capture
 * @returns {Promise<import('./lib/types.js').ToolExecResult & { cursorCropBase64?: string | null }>}
 */
async function executeTool(name, input, hid, capture) {
  if (name === 'task_complete') return { resultText: input.summary, shouldCapture: false, done: true, status: 'success', summary: input.summary };
  if (name === 'task_failed') return { resultText: input.reason, shouldCapture: false, done: true, status: 'failed', summary: input.reason };
  if (name === 'screenshot') return { resultText: 'OK', shouldCapture: true, done: false };
  if (name === 'wait') { await sleep(input.ms); return { resultText: 'OK', shouldCapture: true, done: false }; }

  if (name === 'mouse') {
    const exec = MOUSE_EXEC[input.action];
    if (!exec) return { resultText: `Unknown action: ${input.action}`, shouldCapture: false, done: false };

    await exec(input, hid);

    let cursorCropBase64 = null;
    if (CROP_ACTIONS.has(input.action)) {
      await capture.captureWithDiff();
      const pos = hid.getCursorPosition();
      cursorCropBase64 = await capture.cursorCrop(pos.x, pos.y);
    }

    const pos = toScaled(hid.getCursorPosition());
    return { resultText: `(${pos.x}, ${pos.y})`, shouldCapture: input.action !== 'peek', done: false, cursorCropBase64 };
  }

  if (name === 'keyboard') {
    const exec = KEYBOARD_EXEC[input.action];
    if (!exec) return { resultText: `Unknown action: ${input.action}`, shouldCapture: false, done: false };

    await exec(input, hid);
    return { resultText: 'OK', shouldCapture: true, done: false };
  }

  return { resultText: `Unknown tool: ${name}`, shouldCapture: false, done: false };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const task = await readTask();
  console.log('Claude KVM starting...');
  console.log(`Task: ${task}`);

  // 1. Connect to VNC
  /** @type {import('./lib/types.js').VNCConnectionConfig} */
  const vncConfig = {
    host: process.env.VNC_HOST || '127.0.0.1',
    port: parseInt(process.env.VNC_PORT || '5900', 10),
    auth: /** @type {'auto' | 'none'} */ (process.env.VNC_AUTH || 'auto'),
    username: process.env.VNC_USERNAME || '',
    password: process.env.VNC_PASSWORD || '',
  };

  const vnc = new VNCClient(vncConfig);
  console.log(`Connecting to VNC: ${vncConfig.host}:${vncConfig.port} (auth: ${vncConfig.auth})`);
  const serverInfo = await vnc.connect();
  console.log(`VNC connected: ${serverInfo.name} (${serverInfo.width}x${serverInfo.height})`);

  // 2. Compute scaled display
  native = { width: serverInfo.width, height: serverInfo.height };
  const maxDim = config.display?.max_dimension || 1280;
  const ratio = Math.min(maxDim / native.width, maxDim / native.height, 1);
  scaled = { width: Math.round(native.width * ratio), height: Math.round(native.height * ratio) };

  console.log(`Display: ${native.width}x${native.height} → ${scaled.width}x${scaled.height} (×${ratio.toFixed(3)})`);

  // 3. Initialize
  const hid = new HIDController(config, vnc);
  const capture = new ScreenCapture(config, vnc, native, scaled);
  const tools = getToolDefinitions(scaled);

  const systemPrompt = readFileSync(config.claude.system_prompt_file, 'utf-8')
    .replace(/\{width}/g, String(scaled.width))
    .replace(/\{height}/g, String(scaled.height));

  // 4. Initial screenshot
  console.log('Taking initial screenshot...');
  await capture.captureWithDiff();
  const initialCapture = await capture.captureStableFrame();
  saveScreenshot(initialCapture.base64, 'initial');

  // 5. Agent loop
  const claudeClient = new ClaudeClient(config, systemPrompt, tools, scaled);
  let response = await claudeClient.sendInitialMessage(initialCapture.base64, task);

  for (let iteration = 1; iteration <= config.loop.max_iterations; iteration++) {
    const text = ClaudeClient.extractText(response);
    if (text) console.log(`\n[Claude] ${text}`);

    const toolUses = ClaudeClient.extractToolUses(response);
    if (toolUses.length === 0) break;

    for (const toolUse of toolUses) {
      console.log(`[${iteration}] ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

      let result;
      try {
        result = await executeTool(toolUse.name, toolUse.input, hid, capture);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        result = { resultText: `Error: ${err.message}`, shouldCapture: true, done: false };
      }

      if (result.done) {
        console.log(`\n[${(result.status || 'success').toUpperCase()}] ${result.summary}`);
        vnc.disconnect();
        return;
      }

      let screenshotBase64 = null;
      let diff = null;

      if (result.shouldCapture) {
        const stable = await capture.captureStableFrame();
        screenshotBase64 = stable.base64;
        diff = stable.diff;
        saveScreenshot(screenshotBase64, `${iteration}-${toolUse.name}`);

        if (diff && CLICK_ACTIONS.has(toolUse.input?.action) && diff.changePercent < config.diff.change_percent_threshold) {
          result.resultText += ' WARNING: Screen unchanged — click may have missed.';
        }
      }

      const extraImages = [];
      if (result.cursorCropBase64) {
        extraImages.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: result.cursorCropBase64 } });
      }

      response = await claudeClient.sendToolResult(toolUse.id, result.resultText, screenshotBase64, diff, iteration, config.loop.max_iterations, extraImages);
    }
  }

  console.log('\nMax iterations reached.');
  vnc.disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
