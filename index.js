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
 * Copyright (c) 2026 Rıza Emre ARAS <r.emrearas@proton.me>
 *
 * This file is part of Claude KVM.
 * Released under the MIT License — see LICENSE for details.
 *
 * MCP proxy server — spawns a native VNC daemon (claude-kvm-daemon)
 * and exposes a single vnc_command tool to Claude.
 * Communication: PC (Procedure Call) over stdin/stdout NDJSON.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { vncCommandTool, controlTools } from './tools/index.js';

// ── Configuration ───────────────────────────────────────────

const env = (key, fallback) => process.env[key] ?? fallback;

const DAEMON_PATH = env('CLAUDE_KVM_DAEMON_PATH', 'claude-kvm-daemon');
const DAEMON_PARAMS = env('CLAUDE_KVM_DAEMON_PARAMETERS', '');
const VNC_HOST = env('VNC_HOST', '127.0.0.1');
const VNC_PORT = env('VNC_PORT', '5900');
const VNC_USERNAME = env('VNC_USERNAME', '');
const VNC_PASSWORD = env('VNC_PASSWORD', '');

// ── Logging ─────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(`[MCP ${ts}] ${msg}\n`);
}

// ── Daemon Process Manager ──────────────────────────────────

let daemon = null;
let daemonReady = false;
const display = { width: 1280, height: 800 };
const pendingRequests = new Map();
let lineBuffer = '';

function buildDaemonArgs() {
  const args = ['--host', VNC_HOST, '--port', VNC_PORT];
  if (VNC_USERNAME) args.push('--username', VNC_USERNAME);
  if (VNC_PASSWORD) args.push('--password', VNC_PASSWORD);

  // Extra parameters — passed directly to daemon CLI
  if (DAEMON_PARAMS) {
    const extra = DAEMON_PARAMS.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    args.push(...extra.map((s) => s.replace(/^['"]|['"]$/g, '')));
  }

  return args;
}

function spawnDaemon() {
  const args = buildDaemonArgs();
  log(`Spawning daemon: ${DAEMON_PATH} ${args.join(' ')}`);

  daemon = spawn(DAEMON_PATH, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  daemon.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    let idx;
    while ((idx = lineBuffer.indexOf('\n')) !== -1) {
      const line = lineBuffer.slice(0, idx).trim();
      lineBuffer = lineBuffer.slice(idx + 1);
      if (line) handleDaemonMessage(line);
    }
  });

  daemon.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  daemon.on('exit', (code) => {
    log(`Daemon exited with code ${code}`);
    daemonReady = false;
    daemon = null;
    for (const [, req] of pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Daemon exited'));
    }
    pendingRequests.clear();
  });

  daemon.on('error', (err) => {
    log(`Daemon spawn error: ${err.message}`);
  });
}

function handleDaemonMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    log(`Invalid daemon JSON: ${line}`);
    return;
  }

  // PC notification — has method, no id
  if (msg.method) {
    const { scaledWidth, scaledHeight, state } = msg.params || {};
    if (msg.method === 'ready') {
      daemonReady = true;
      if (scaledWidth) display.width = scaledWidth;
      if (scaledHeight) display.height = scaledHeight;
      log(`Daemon ready — display ${display.width}×${display.height}`);
    } else if (msg.method === 'vnc_state') {
      log(`VNC state: ${state}`);
    }
    return;
  }

  // PC response — has id
  if (msg.id !== undefined && pendingRequests.has(msg.id)) {
    const req = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    clearTimeout(req.timer);
    req.resolve(msg);
  }
}

/**
 * Send a PC request to the daemon and wait for response.
 * @param {string} method - PC method name
 * @param {object} [params] - Method parameters
 * @param {number} [timeoutMs=30000] - Timeout in milliseconds
 * @returns {Promise<object>} - Daemon PC response
 */
function sendRequest(method, params, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!daemon || !daemonReady) {
      reject(new Error('Daemon not ready. Check CLAUDE_KVM_DAEMON_PATH and VNC credentials.'));
      return;
    }

    const id = randomUUID();

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Daemon request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timer });

    const request = { method, id };
    if (params && Object.keys(params).length > 0) request.params = params;

    daemon.stdin.write(JSON.stringify(request) + '\n');
  });
}

// ── Wait for daemon ready ───────────────────────────────────

function waitForReady(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (daemonReady) { resolve(); return; }

    const interval = setInterval(() => {
      if (daemonReady) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve();
      }
    }, 100);

    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Daemon did not become ready within timeout'));
    }, timeoutMs);
  });
}

// ── Tool Execution ──────────────────────────────────────────

async function executeVncCommand(input) {
  const { action, ...params } = input;

  const response = await sendRequest(action, params);

  // PC error response
  if (response.error) {
    return {
      content: [{ type: 'text', text: `Error: ${response.error.message}` }],
      isError: true,
    };
  }

  const { detail, image, x, y, scaledWidth, scaledHeight } = response.result || {};
  const content = [];

  // Text detail
  if (detail) {
    content.push({ type: 'text', text: detail });
  }

  // Image
  if (image) {
    content.push({ type: 'image', data: image, mimeType: 'image/png' });
  }

  // Cursor position (nudge, cursor_crop)
  if (x !== undefined && y !== undefined) {
    content.push({ type: 'text', text: `cursor: (${x}, ${y})` });
  }

  // Display dimensions (health — no image)
  if (scaledWidth !== undefined && !image) {
    content.push({ type: 'text', text: `display: ${scaledWidth}×${scaledHeight}` });
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: 'OK' });
  }

  return { content };
}

// ── MCP Server ──────────────────────────────────────────────

async function main() {
  log('Claude KVM v1.0.0 — Native VNC proxy');

  spawnDaemon();

  const mcpServer = new McpServer(
    { name: 'claude-kvm', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  try {
    await waitForReady(30000);
  } catch (err) {
    log(`Warning: ${err.message} — registering with default dimensions`);
  }

  // Register vnc_command tool
  const vncTool = vncCommandTool(display.width, display.height);
  mcpServer.tool(
    vncTool.name,
    vncTool.inputSchema,
    async (input) => {
      try {
        return await executeVncCommand(input);
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Register control tools
  for (const tool of controlTools()) {
    mcpServer.tool(
      tool.name,
      tool.inputSchema,
      async (input) => {
        if (tool.name === 'task_complete') {
          return { content: [{ type: 'text', text: input.summary }] };
        }
        if (tool.name === 'task_failed') {
          return { content: [{ type: 'text', text: input.reason }], isError: true };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  log('MCP server connected on stdio');

  process.on('SIGINT', () => {
    log('Shutting down...');
    if (daemon) {
      daemon.stdin.write(JSON.stringify({ method: 'shutdown' }) + '\n');
      setTimeout(() => { daemon?.kill(); process.exit(0); }, 500);
    } else {
      process.exit(0);
    }
  });
}

main().catch((err) => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
