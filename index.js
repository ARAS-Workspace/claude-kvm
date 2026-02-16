#!/usr/bin/env node
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

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VNCClient } from './lib/vnc.js';
import { HIDController } from './lib/hid.js';
import { ScreenCapture } from './lib/capture.js';
import { getToolDefinitions } from './tools/index.js';

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Display Scaling ─────────────────────────────────────────

/** Native resolution (from VNC) */
let native = { width: 0, height: 0 };
/** Scaled resolution (what the client sees) */
let scaled = { width: 0, height: 0 };

/** Scale client coordinates → native */
function toNative(x, y) {
  const sx = native.width / scaled.width;
  const sy = native.height / scaled.height;
  return { x: Math.round(x * sx), y: Math.round(y * sy) };
}

/** Scale native cursor position → client coordinate space */
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

// ── Tool Call Handler ───────────────────────────────────────

/**
 * @param {string} name
 * @param {Record<string, any>} args
 * @param {HIDController} hid
 * @param {ScreenCapture} capture
 * @returns {Promise<import('@modelcontextprotocol/sdk/types.js').CallToolResult>}
 */
async function handleToolCall(name, args, hid, capture) {
  console.error(`[tool] ${name}(${JSON.stringify(args)})`);

  let result;
  try {
    result = await executeTool(name, args, hid, capture);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }

  /** @type {Array<{type: string, text?: string, data?: string, mimeType?: string}>} */
  const content = [{ type: 'text', text: result.resultText }];

  if (result.shouldCapture) {
    const stable = await capture.captureStableFrame();
    saveScreenshot(stable.base64, name);

    if (stable.diff && CLICK_ACTIONS.has(args?.action) && stable.diff.changePercent < config.diff.change_percent_threshold) {
      content[0].text += ' WARNING: Screen unchanged — click may have missed.';
    }

    content.push({ type: 'image', data: stable.base64, mimeType: 'image/png' });
  }

  if (result.cursorCropBase64) {
    content.push({ type: 'image', data: result.cursorCropBase64, mimeType: 'image/png' });
  }

  return { content };
}

// ── MCP Server ──────────────────────────────────────────────

async function main() {
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
  console.error(`Connecting to VNC: ${vncConfig.host}:${vncConfig.port} (auth: ${vncConfig.auth})`);
  const serverInfo = await vnc.connect();
  console.error(`VNC connected: ${serverInfo.name} (${serverInfo.width}x${serverInfo.height})`);

  // 2. Compute scaled display
  native = { width: serverInfo.width, height: serverInfo.height };
  const maxDim = config.display?.max_dimension || 1280;
  const ratio = Math.min(maxDim / native.width, maxDim / native.height, 1);
  scaled = { width: Math.round(native.width * ratio), height: Math.round(native.height * ratio) };

  console.error(`Display: ${native.width}x${native.height} → ${scaled.width}x${scaled.height} (×${ratio.toFixed(3)})`);

  // 3. Initialize
  const hid = new HIDController(config, vnc);
  const capture = new ScreenCapture(config, vnc, native, scaled);
  const tools = getToolDefinitions(scaled);

  // 4. Create MCP server
  const mcpServer = new McpServer(
    { name: 'claude-kvm', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // Register tools
  for (const tool of tools) {
    if (tool.inputSchema) {
      mcpServer.registerTool(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
      }, async (args) => handleToolCall(tool.name, args, hid, capture));
    } else {
      mcpServer.registerTool(tool.name, {
        description: tool.description,
      }, async () => handleToolCall(tool.name, {}, hid, capture));
    }
  }

  // 5. Start MCP transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('Claude KVM MCP server running on stdio');

  // Graceful shutdown
  process.on('SIGINT', () => { vnc.disconnect(); process.exit(0); });
  process.on('SIGTERM', () => { vnc.disconnect(); process.exit(0); });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
