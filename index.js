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

import { mkdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VNCClient } from './lib/vnc.js';
import { HIDController } from './lib/hid.js';
import { ScreenCapture } from './lib/capture.js';
import { SSHClient } from './lib/ssh.js';
import { getToolDefinitions } from './tools/index.js';

// ── Load Configuration (from environment variables) ─────────

const env = (key, fallback) => process.env[key] ?? fallback;
const envInt = (key, fallback) => parseInt(env(key, String(fallback)), 10);

/** @type {import('./lib/types.js').ClaudeKVMConfig} */
const config = {
  display: {
    max_dimension: envInt('DISPLAY_MAX_DIMENSION', 1280),
  },
  hid: {
    click_hold_ms: envInt('HID_CLICK_HOLD_MS', 80),
    key_hold_ms: envInt('HID_KEY_HOLD_MS', 50),
    typing_delay_ms: {
      min: envInt('HID_TYPING_DELAY_MIN_MS', 30),
      max: envInt('HID_TYPING_DELAY_MAX_MS', 100),
    },
    scroll_events_per_step: envInt('HID_SCROLL_EVENTS_PER_STEP', 5),
  },
  capture: {},
  diff: {
    pixel_threshold: envInt('DIFF_PIXEL_THRESHOLD', 30),
  },
  vnc_timeouts: {
    connect_timeout_ms: envInt('VNC_CONNECT_TIMEOUT_MS', 10000),
    screenshot_timeout_ms: envInt('VNC_SCREENSHOT_TIMEOUT_MS', 3000),
  },
};

// ── Screenshot Saving (CI) ──────────────────────────────────

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || null;
const VLM_TOOL_PATH = env('CLAUDE_KVM_VLM_TOOL_PATH', null);
const vlmEnabled = !!VLM_TOOL_PATH;

if (vlmEnabled) console.error(`VLM tool configured: ${VLM_TOOL_PATH}`);
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

// ── Module-level State (populated by connectVNC) ────────

/** @type {import('./lib/vnc.js').VNCClient | null} */
let vnc = null;
/** @type {import('./lib/hid.js').HIDController | null} */
let hid = null;
/** @type {import('./lib/capture.js').ScreenCapture | null} */
let capture = null;
/** @type {import('./lib/ssh.js').SSHClient | null} */
let ssh = null;
/** @type {number | null} */
let startTime = null;

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
  hover:        async (i, h) => { const p = toNative(i.x, i.y); await h.mouseMove(p.x, p.y); await sleep(400); },
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
};

// ── Keyboard Action Map ─────────────────────────────────────

/** @type {Record<string, (input: Record<string, any>, hid: HIDController) => Promise<void>>} */
const KEYBOARD_EXEC = {
  press: async (i, h) => { await h.keyPress(i.key); },
  combo: async (i, h) => { await h.keyCombo(i.keys); },
  type:  async (i, h) => { await h.typeText(i.text); },
  paste: async (i, h) => { await h.pasteText(i.text); },
};

// ── Tool Executor ───────────────────────────────────────────

/**
 * @param {string} name
 * @param {Record<string, any>} input
 * @returns {Promise<import('./lib/types.js').ToolExecResult>}
 */
async function executeTool(name, input) {
  // ── Terminal ──
  if (name === 'task_complete') return { text: input.summary, done: true, status: 'success' };
  if (name === 'task_failed') return { text: input.reason, done: true, status: 'failed' };

  // ── Health Check (works even when VNC is down) ──
  if (name === 'health_check') {
    const isConnected = vnc?.connected && vnc?.ready;
    const info = {
      vnc: {
        status: vnc?.reconnecting ? 'reconnecting' : isConnected ? 'connected' : 'disconnected',
        resolution: isConnected ? `${native.width}x${native.height}` : null,
        scaled: isConnected ? `${scaled.width}x${scaled.height}` : null,
        server: isConnected ? vnc.serverName : null,
        macOS: isConnected ? vnc.isMacOS : null,
        reconnectCount: vnc?.reconnectCount ?? 0,
        lastScreenshotMs: capture?.lastScreenshotMs ?? null,
      },
      ssh: {
        status: ssh?.connected ? 'connected' : ssh ? 'disconnected' : 'not configured',
        host: ssh ? `${ssh.host}:${ssh.port}` : null,
        commandCount: ssh?.commandCount ?? 0,
      },
      uptime: startTime ? Math.floor((Date.now() - startTime) / 1000) + 's' : null,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
    // Hint: if macOS + SSH available, suggest AppleScript validation
    if (isConnected && vnc.isMacOS && ssh) {
      info.hint = 'macOS detected with SSH available. Use osascript via ssh tool for UI validation, clipboard access (pbpaste), and app control. Note: first-time osascript access to an app may trigger a macOS permission dialog — if an SSH command times out, use VNC screenshot to check for the dialog and click Allow.';
    }
    return { text: JSON.stringify(info, null, 2) };
  }

  // ── SSH (independent of VNC) ──
  if (name === 'ssh') {
    if (!ssh) return { text: 'SSH not configured. Set SSH_HOST, SSH_USER, and SSH_PASSWORD or SSH_KEY environment variables.' };
    const result = await ssh.exec(input.command, input.timeout);
    const parts = [];
    if (result.stdout) parts.push(result.stdout);
    if (result.stderr) parts.push(`[stderr] ${result.stderr}`);
    if (result.code !== 0) parts.push(`[exit code: ${result.code}]`);
    return { text: parts.join('\n') || '(no output)' };
  }

  // ── VNC Readiness Gate ──
  if (!vnc?.ready) {
    const state = vnc?.reconnecting ? 'reconnecting' : 'connecting';
    return { text: `VNC ${state}... retry in a few seconds.` };
  }

  // ── Screen Instruments ──
  if (name === 'screenshot') {
    const base64 = await capture.captureScreenshot();
    saveScreenshot(base64, name);
    return { text: 'OK', imageBase64: base64 };
  }

  if (name === 'cursor_crop') {
    const pos = hid.getCursorPosition();
    const base64 = await capture.cursorCrop(pos.x, pos.y, 150);
    saveScreenshot(base64, name);
    const sp = toScaled(pos);
    return { text: `(${sp.x}, ${sp.y})`, imageBase64: base64 };
  }

  if (name === 'diff_check') {
    const result = await capture.quickDiffCheck();
    return { text: `changeDetected: ${result.changeDetected}` };
  }

  if (name === 'set_baseline') {
    await capture.setBaseline();
    return { text: 'OK' };
  }

  // ── VLM Query (macOS on-device vision model) ──
  if (name === 'vlm_query') {
    if (!VLM_TOOL_PATH) return { text: 'VLM tool not configured. Set CLAUDE_KVM_VLM_TOOL_PATH environment variable.' };

    const topLeft = toNative(input.x, input.y);
    const sx = native.width / scaled.width;
    const sy = native.height / scaled.height;
    const nativeW = Math.round(input.width * sx);
    const nativeH = Math.round(input.height * sy);

    const pngBuffer = await capture.cropRegion(topLeft.x, topLeft.y, nativeW, nativeH);

    const args = ['--prompt', input.prompt];
    if (input.max_tokens) args.push('--max-tokens', String(input.max_tokens));
    if (input.verbose) args.push('--verbose');

    const vlmResult = await new Promise((resolve, reject) => {
      const child = execFile(VLM_TOOL_PATH, args, {
        encoding: 'buffer',
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      }, (err, stdout, stderr) => {
        const stderrStr = stderr?.toString().trim() || '';
        if (err) {
          const errorMatch = stderrStr.match(/\[ERROR]\s*(.*)/);
          reject(new Error(errorMatch ? errorMatch[1] : (err.message || 'VLM inference failed')));
          return;
        }
        if (stderrStr) console.error(`[vlm] ${stderrStr}`);
        resolve(stdout.toString().trim());
      });

      child.stdin.write(pngBuffer);
      child.stdin.end();
    });

    return { text: vlmResult };
  }

  // ── Flow Control ──
  if (name === 'wait') {
    await sleep(input.ms);
    return { text: 'OK' };
  }

  // ── Mouse ──
  if (name === 'mouse') {
    const exec = MOUSE_EXEC[input.action];
    if (!exec) return { text: `Unknown action: ${input.action}` };
    await exec(input, hid);
    const pos = toScaled(hid.getCursorPosition());
    return { text: `(${pos.x}, ${pos.y})` };
  }

  // ── Keyboard ──
  if (name === 'keyboard') {
    const exec = KEYBOARD_EXEC[input.action];
    if (!exec) return { text: `Unknown action: ${input.action}` };
    await exec(input, hid);
    return { text: 'OK' };
  }

  return { text: `Unknown tool: ${name}` };
}

// ── Tool Call Handler ───────────────────────────────────────

/**
 * @param {string} name
 * @param {Record<string, any>} args
 * @returns {Promise<import('@modelcontextprotocol/sdk/types.js').CallToolResult>}
 */
async function handleToolCall(name, args) {
  console.error(`[tool] ${name}(${JSON.stringify(args)})`);

  let result;
  try {
    result = await executeTool(name, args);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }

  /** @type {Array<import('@modelcontextprotocol/sdk/types.js').TextContent | import('@modelcontextprotocol/sdk/types.js').ImageContent>} */
  const content = [{ type: 'text', text: result.text }];

  if (result.imageBase64) {
    content.push({ type: 'image', data: result.imageBase64, mimeType: 'image/png' });
  }

  return { content };
}

// ── MCP Server ──────────────────────────────────────────────

/**
 * Initialize display scaling and HID/Capture controllers after VNC connects.
 * @param {import('./lib/types.js').VNCServerInfo} serverInfo
 */
function initializeDisplay(serverInfo) {
  native = { width: serverInfo.width, height: serverInfo.height };
  const maxDim = config.display?.max_dimension || 1280;
  const ratio = Math.min(maxDim / native.width, maxDim / native.height, 1);
  scaled = { width: Math.round(native.width * ratio), height: Math.round(native.height * ratio) };

  console.error(`Display: ${native.width}x${native.height} → ${scaled.width}x${scaled.height} (×${ratio.toFixed(3)})`);

  hid = new HIDController(config, vnc);
  capture = new ScreenCapture(config, vnc, native, scaled);
  startTime = Date.now();
}

/**
 * Connect to VNC with retry logic. Non-blocking — fires and forgets.
 * @param {import('./lib/types.js').VNCConnectionConfig} vncConfig
 * @param {number} [maxRetries=3]
 */
async function connectVNC(vncConfig, maxRetries = 3) {
  vnc = new VNCClient(vncConfig, {
    connectTimeoutMs: config.vnc_timeouts.connect_timeout_ms,
    screenshotTimeoutMs: config.vnc_timeouts.screenshot_timeout_ms,
  });

  // Handle reconnects — reinitialize display/HID/capture
  vnc.on('reconnected', (info) => {
    console.error(`VNC reconnected: ${info.name} (${info.width}x${info.height})`);
    initializeDisplay(info);
  });

  vnc.on('reconnect-failed', () => {
    console.error('VNC reconnect failed — all attempts exhausted');
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.error(`Connecting to VNC: ${vncConfig.host}:${vncConfig.port} (attempt ${attempt}/${maxRetries})`);
      const serverInfo = await vnc.connect();
      console.error(`VNC connected: ${serverInfo.name} (${serverInfo.width}x${serverInfo.height}) macOS=${vnc.isMacOS}`);
      initializeDisplay(serverInfo);
      return;
    } catch (err) {
      console.error(`VNC connect attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.error(`Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error('VNC initial connection failed — tools will return retry hints until connected');
}

async function main() {
  // 1. VNC config
  /** @type {import('./lib/types.js').VNCConnectionConfig} */
  const vncConfig = {
    host: process.env.VNC_HOST || '127.0.0.1',
    port: parseInt(process.env.VNC_PORT || '5900', 10),
    auth: /** @type {'auto' | 'none'} */ (process.env.VNC_AUTH || 'auto'),
    username: process.env.VNC_USERNAME || '',
    password: process.env.VNC_PASSWORD || '',
  };

  // 2. SSH config (optional — tool only registered if configured)
  const sshEnabled = !!(process.env.SSH_HOST && process.env.SSH_USER);
  if (sshEnabled) {
    /** @type {import('./lib/types.js').SSHConnectionConfig} */
    const sshConfig = {
      host: process.env.SSH_HOST,
      port: parseInt(process.env.SSH_PORT || '22', 10),
      username: process.env.SSH_USER,
      password: process.env.SSH_PASSWORD || undefined,
      privateKeyPath: process.env.SSH_KEY || undefined,
    };
    ssh = new SSHClient(sshConfig);
    // Lazy connect — will connect on first exec()
    console.error(`SSH configured: ${sshConfig.host}:${sshConfig.port} (user=${sshConfig.username})`);
  }

  // 3. Create MCP server and register tools (before VNC connects)
  //    Use a generous default display size — will be updated once VNC connects
  const defaultDisplay = { width: config.display?.max_dimension || 1280, height: 800 };
  const tools = getToolDefinitions(defaultDisplay, { sshEnabled, vlmEnabled });

  const mcpServer = new McpServer(
    { name: 'claude-kvm', version: '1.0.4' },
    { capabilities: { tools: {} } },
  );

  for (const tool of tools) {
    if (tool.inputSchema) {
      mcpServer.registerTool(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
      }, async (args) => handleToolCall(tool.name, args));
    } else {
      mcpServer.registerTool(tool.name, {
        description: tool.description,
      }, async () => handleToolCall(tool.name, {}));
    }
  }

  // 4. Start MCP transport IMMEDIATELY (no VNC dependency)
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('Claude KVM MCP server running on stdio');

  // 5. Connect to VNC in background (non-blocking)
  void connectVNC(vncConfig);

  // Graceful shutdown
  process.on('SIGINT', () => { ssh?.disconnect(); vnc?.disconnect(); process.exit(0); });
  process.on('SIGTERM', () => { ssh?.disconnect(); vnc?.disconnect(); process.exit(0); });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
