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
 *
 * MCP proxy server — spawns a native VNC daemon (claude-kvm-daemon)
 * and exposes a single vnc_command tool to Claude.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { vncCommandTool, controlTools } from './tools/index.js';

// ── Configuration ───────────────────────────────────────────

const env = (key, fallback) => process.env[key] ?? fallback;

const DAEMON_PATH = env('CLAUDE_KVM_DAEMON_PATH', '');
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
const pendingRequests = new Map(); // id → { resolve, reject, timer }
let lineBuffer = '';

function spawnDaemon() {
  if (!DAEMON_PATH) {
    log('CLAUDE_KVM_DAEMON_PATH not set — daemon will not start');
    return;
  }

  const args = ['--host', VNC_HOST, '--port', VNC_PORT];
  if (VNC_USERNAME) args.push('--username', VNC_USERNAME);
  if (VNC_PASSWORD) args.push('--password', VNC_PASSWORD);

  log(`Spawning daemon: ${DAEMON_PATH} ${args.join(' ')}`);

  daemon = spawn(DAEMON_PATH, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Read stdout line by line (NDJSON)
  daemon.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
      const line = lineBuffer.slice(0, newlineIdx).trim();
      lineBuffer = lineBuffer.slice(newlineIdx + 1);
      if (line) handleDaemonEvent(line);
    }
  });

  // Forward stderr to our stderr
  daemon.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  daemon.on('exit', (code) => {
    log(`Daemon exited with code ${code}`);
    daemonReady = false;
    daemon = null;
    // Reject all pending requests
    for (const [, req] of pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Daemon exited'));
    }
    pendingRequests.clear();
  });

  daemon.on('error', (err) => {
    log(`Daemon error: ${err.message}`);
  });
}

function handleDaemonEvent(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    log(`Invalid daemon JSON: ${line}`);
    return;
  }

  // Handle ready event
  if (event.type === 'ready') {
    daemonReady = true;
    if (event.display.width) display.width = event.display.width;
    if (event.display.height) display.height = event.display.height;
    log(`Daemon ready — display ${display.width}×${display.height}`);
    return;
  }

  // Handle vnc_state events (no request id)
  if (event.type === 'vnc_state') {
    log(`VNC state: ${event.detail}`);
    return;
  }

  // Handle response to a pending request
  if (event.id && pendingRequests.has(event.id)) {
    const req = pendingRequests.get(event.id);
    pendingRequests.delete(event.id);
    clearTimeout(req.timer);

    if (event.type === 'status') {
      // Status events are intermediate — re-register and wait for result
      pendingRequests.set(event.id, req);
      return;
    }

    req.resolve(event);
  }
}

/**
 * Send a command to the daemon and wait for response.
 * @param {object} command - Command to send (type, params...)
 * @param {number} [timeoutMs=30000] - Timeout in milliseconds
 * @returns {Promise<object>} - Daemon response event
 */
function sendCommand(command, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!daemon || !daemonReady) {
      reject(new Error('Daemon not ready. Check CLAUDE_KVM_DAEMON_PATH and VNC credentials.'));
      return;
    }

    const id = randomUUID();
    command.id = id;

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Daemon command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timer });

    const json = JSON.stringify(command) + '\n';
    daemon.stdin.write(json);
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

  // Map action to daemon command type
  const command = { type: action, ...params };

  // VLM prompt uses 'payload' field
  if (action === 'vlm_prompt' && params.payload) {
    command.payload = params.payload;
  }

  const response = await sendCommand(command, action === 'vlm_prompt' ? 120000 : 30000);

  // Build MCP response
  const content = [];

  if (response.type === 'error') {
    return { content: [{ type: 'text', text: `Error: ${response.detail}` }], isError: true };
  }

  // Text result
  if (response.detail) {
    content.push({ type: 'text', text: response.detail });
  } else if (response.success) {
    content.push({ type: 'text', text: 'OK' });
  }

  // Image result
  if (response.image) {
    content.push({ type: 'image', data: response.image, mimeType: 'image/png' });
  }

  // Cursor position
  if (response.x !== undefined && response.y !== undefined) {
    content.push({ type: 'text', text: `cursor: (${response.x}, ${response.y})` });
  }

  return { content };
}

// ── MCP Server ──────────────────────────────────────────────

async function main() {
  log('Claude KVM v2.0.0 — Native VNC proxy');

  // Spawn daemon
  spawnDaemon();

  // Create MCP server immediately (don't block on daemon ready)
  const mcpServer = new McpServer(
    { name: 'claude-kvm', version: '2.0.0' },
    { capabilities: { tools: {} } },
  );

  // Wait for daemon to connect before registering tools with dimensions
  if (DAEMON_PATH) {
    try {
      await waitForReady(30000);
    } catch (err) {
      log(`Warning: ${err.message} — registering with default dimensions`);
    }
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

  // Start MCP transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  log('MCP server connected on stdio');

  // Cleanup on exit
  process.on('SIGINT', () => {
    log('Shutting down...');
    if (daemon) {
      daemon.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n');
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
