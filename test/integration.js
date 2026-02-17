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

/**
 * Integration test harness — drives the MCP server via Claude API.
 *
 * Spawns the claude-kvm MCP server as a child process, lists its tools,
 * then runs an agentic loop: Claude receives a task, calls MCP tools,
 * and the loop continues until task_complete or task_failed.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  — required
 *   VNC_HOST           — VNC server host (default: 127.0.0.1)
 *   VNC_PORT           — VNC server port (default: 5900)
 *   VNC_PASSWORD       — VNC password
 *   VNC_USERNAME       — VNC username (for ARD auth)
 *   MODEL              — Claude model (default: claude-sonnet-4-5-20250929)
 *   MAX_TURNS          — max agentic turns (default: 30)
 *   TASK               — task prompt (or pass as CLI arg)
 *   SCREENSHOTS_DIR    — directory to save screenshots (default: ./test-screenshots)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTask() {
  if (process.env.TASK) return process.env.TASK;

  const isMac = process.argv.includes('--mac');
  const promptFile = resolve(__dirname, isMac ? 'test_prompt_mac.md' : 'test_prompt.md');
  return readFileSync(promptFile, 'utf-8').trim();
}

const MODEL = process.env.MODEL || 'claude-sonnet-4-5-20250929';
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '30', 10);
const TASK = loadTask();

function log(label, ...args) {
  const ts = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' });
  console.log(`[${ts}] [${label}]`, ...args);
}

async function main() {
  log('INIT', `Model: ${MODEL}`);
  log('INIT', `Max turns: ${MAX_TURNS}`);
  log('INIT', `Task: ${TASK}`);

  // ── Start MCP server as child process ───────────────────
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['index.js'],
    env: {
      ...process.env,
      SCREENSHOTS_DIR: process.env.SCREENSHOTS_DIR || './test-screenshots',
    },
  });

  const mcp = new Client({ name: 'integration-test', version: '1.0.0' });
  await mcp.connect(transport);
  log('MCP', 'Connected to claude-kvm server');

  // ── List tools ──────────────────────────────────────────
  const { tools: mcpTools } = await mcp.listTools();
  log('MCP', `Tools: ${mcpTools.map(t => t.name).join(', ')}`);

  // Convert MCP tool schemas to Anthropic API format
  const tools = mcpTools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema || { type: 'object', properties: {} },
  }));

  // ── Claude API client ───────────────────────────────────
  const anthropic = new Anthropic();

  const systemPrompt = [
    'You are controlling a remote computer via VNC and SSH KVM tools.',
    'Complete the given task efficiently.',
    'Minimize unnecessary screenshots — use diff_check to verify simple changes.',
    'Prefer click_at over move+click. Use keyboard shortcuts when possible.',
    'Use the ssh tool for shell commands, process verification, and system info.',
    'When done, call task_complete. If stuck after multiple attempts, call task_failed.',
  ].join(' ');

  /** @type {Array<{role: 'user' | 'assistant', content: any}>} */
  const messages = [{ role: 'user', content: String(TASK) }];
  let turn = 0;

  log('TEST', '\u2550'.repeat(60));
  log('TEST', 'Starting agentic loop');
  log('TEST', '\u2550'.repeat(60));

  // ── Agentic loop ────────────────────────────────────────
  while (turn < MAX_TURNS) {
    turn++;
    log('TURN', `${turn}/${MAX_TURNS}`);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools,
    });

    let hasToolUse = false;
    /** @type {Anthropic.ToolResultBlockParam[]} */
    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        log('CLAUDE', block.text);
      }

      if (block.type === 'tool_use') {
        hasToolUse = true;
        log('TOOL', `${block.name}(${JSON.stringify(block.input)})`);

        try {
          const result = await mcp.callTool({
            name: block.name,
            arguments: block.input,
          });

          // Convert MCP response → Anthropic tool_result content
          /** @type {Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>} */
          const content = [];

          for (const item of result.content) {
            if (item.type === 'text') {
              content.push({ type: 'text', text: item.text });
              log('RESULT', item.text);
            } else if (item.type === 'image') {
              content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: item.mimeType || 'image/png',
                  data: item.data,
                },
              });
              log('RESULT', `[image ${item.mimeType}]`);
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content,
          });

          // Terminal states
          if (block.name === 'task_complete') {
            log('TEST', '\u2550'.repeat(60));
            log('TEST', `PASSED \u2014 ${block.input.summary}`);
            log('TEST', '\u2550'.repeat(60));
            await mcp.close();
            process.exit(0);
          }

          if (block.name === 'task_failed') {
            log('TEST', '\u2550'.repeat(60));
            log('TEST', `FAILED \u2014 ${block.input.reason}`);
            log('TEST', '\u2550'.repeat(60));
            await mcp.close();
            process.exit(1);
          }
        } catch (err) {
          log('ERROR', `${block.name}: ${err.message}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            is_error: true,
          });
        }
      }
    }

    // No tool calls — Claude finished without terminal tool
    if (!hasToolUse) {
      log('TEST', 'No tool calls in response — ending');
      break;
    }

    // Append to conversation
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  if (turn >= MAX_TURNS) {
    log('TEST', `Max turns (${MAX_TURNS}) reached without completion`);
  }

  await mcp.close();
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});