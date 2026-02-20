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
 */

/**
 * Integration test — Executor (Claude) + Observer (Qwen-VL).
 *
 * Claude sees the screen, executes VNC actions, verifies via observer,
 * and uses grounding when clicks miss repeatedly.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY     — required
 *   OPENROUTER_API_KEY    — optional (observer + grounding)
 *   EXECUTOR_MODEL        — executor model (default: claude-opus-4-6)
 *   OBSERVER_MODEL        — observer model (default: qwen/qwen3-vl-235b-a22b-instruct)
 *   EXECUTOR_MAX_TURNS    — max turns (default: 30)
 *   VNC_HOST / VNC_PORT / VNC_PASSWORD / VNC_USERNAME
 *   SCREENSHOTS_DIR       — screenshot output (default: ./test-screenshots)
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ANTHROPIC_API_KEY, OPENROUTER_API_KEY,
  EXECUTOR_MODEL, OBSERVER_MODEL,
  EXECUTOR_MAX_TURNS, TASK,
} from './lib/config.js';
import { loadPrompt } from './lib/config.js';
import { log, saveScreenshot } from './lib/log.js';
import { connectMCP, takeScreenshot } from './lib/mcp.js';
import { observe, ground } from './lib/observer.js';

// ── Tool Definitions ─────────────────────────────────────

const VERIFY_TOOL = {
  name: 'verify',
  description: 'Ask about the current screen state. An independent vision observer answers in text.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'What to check on the screen' },
    },
    required: ['question'],
  },
};

const GROUND_TOOL = {
  name: 'ground',
  description: 'Get exact pixel coordinates of a UI element from the observer. Use when your clicks are not landing on the target after 2-3 failed attempts. Returns "x,y" coordinates.',
  input_schema: {
    type: 'object',
    properties: {
      element: { type: 'string', description: 'Description of the element to locate, e.g., "Skip this step button", "OK button in dialog"' },
    },
    required: ['element'],
  },
};

const TASK_COMPLETE_TOOL = {
  name: 'task_complete',
  description: 'The entire task has been completed successfully.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'What was accomplished' },
    },
    required: ['summary'],
  },
};

const TASK_FAILED_TOOL = {
  name: 'task_failed',
  description: 'The task cannot be completed.',
  input_schema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Why the task failed' },
    },
    required: ['reason'],
  },
};

// ── Main ──────────────────────────────────────────────────

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('Fatal: ANTHROPIC_API_KEY is required');
    process.exit(1);
  }

  if (!OPENROUTER_API_KEY) {
    log('WARN', 'OPENROUTER_API_KEY not set — verify() and ground() will be unavailable');
  }

  const { mcp, screenWidth, screenHeight } = await connectMCP();
  const anthropic = new Anthropic();
  const systemPrompt = loadPrompt('executor');

  // Get MCP tools for executor (exclude terminal tools — handled in JS)
  const mcpToolsResult = await mcp.listTools();
  const mcpTools = mcpToolsResult.tools
    .filter(t => t.name !== 'task_complete' && t.name !== 'task_failed')
    .map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema || { type: 'object', properties: {} },
    }));

  const tools = [...mcpTools, VERIFY_TOOL, GROUND_TOOL, TASK_COMPLETE_TOOL, TASK_FAILED_TOOL];

  log('INIT', `MCP tools: ${mcpTools.map(t => t.name).join(', ')}`);
  log('INIT', `Executor: ${EXECUTOR_MODEL} (max ${EXECUTOR_MAX_TURNS} turns)`);
  log('INIT', `Observer: ${OBSERVER_MODEL}${OPENROUTER_API_KEY ? '' : ' (disabled)'}`);
  log('INIT', `Display: ${screenWidth}×${screenHeight}`);
  log('INIT', `Task: ${TASK.slice(0, 120)}...`);

  // Initial screenshot
  const screenshot = await takeScreenshot(mcp);

  /** @type {import('@anthropic-ai/sdk').MessageParam[]} */
  const messages = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot } },
      { type: 'text', text: TASK },
    ],
  }];

  log('TEST', '\u2550'.repeat(60));
  log('TEST', 'Starting — Executor + Observer');
  log('TEST', '\u2550'.repeat(60));

  for (let turn = 1; turn <= EXECUTOR_MAX_TURNS; turn++) {
    // Last-turn warning
    if (turn === EXECUTOR_MAX_TURNS && messages.length > 1) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
        lastMsg.content.push({
          type: 'text',
          text: 'IMPORTANT: This is your LAST turn. Call task_complete() or task_failed() now.',
        });
      }
    }

    log('EXEC', `turn ${turn}/${EXECUTOR_MAX_TURNS}`);

    const response = await anthropic.messages.create({
      model: EXECUTOR_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools,
    });

    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        log('EXEC', block.text);
      }

      if (block.type !== 'tool_use') {
        // skip non-tool blocks
      } else if (block.name === 'task_complete') {
        log('TEST', '\u2550'.repeat(60));
        log('TEST', `PASSED \u2014 ${block.input.summary}`);
        log('TEST', '\u2550'.repeat(60));
        await mcp.close();
        process.exit(0);
      } else if (block.name === 'task_failed') {
        log('TEST', '\u2550'.repeat(60));
        log('TEST', `FAILED \u2014 ${block.input.reason}`);
        log('TEST', '\u2550'.repeat(60));
        await mcp.close();
        process.exit(1);
      } else if (block.name === 'verify') {
        log('VERIFY', block.input.question);
        const answer = await observe(block.input.question, mcp);
        log('VERIFY-RESULT', answer);
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: [{ type: 'text', text: answer }],
        });
      } else if (block.name === 'ground') {
        log('GROUND', block.input.element);
        const coords = await ground(block.input.element, mcp, screenWidth, screenHeight);
        log('GROUND-RESULT', coords);
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: [{ type: 'text', text: coords }],
        });
      } else if (block.name === 'action_queue') {
        log('QUEUE', `${block.input.actions.length} actions`);
        try {
          const result = await mcp.callTool({ name: 'action_queue', arguments: block.input });
          const text = result.content?.[0]?.text || 'OK';
          log('QUEUE-RESULT', text);
          toolResults.push({
            type: 'tool_result', tool_use_id: block.id,
            content: [{ type: 'text', text }],
          });
        } catch (err) {
          log('QUEUE-ERROR', err.message);
          toolResults.push({
            type: 'tool_result', tool_use_id: block.id,
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            is_error: true,
          });
        }
      } else if (block.name === 'vnc_command') {
        log('VNC', `${block.input.action}(${JSON.stringify(block.input)})`);
        try {
          const result = await mcp.callTool({ name: 'vnc_command', arguments: block.input });
          const content = [];
          for (const item of result.content) {
            if (item.type === 'text') {
              content.push({ type: 'text', text: item.text });
              log('VNC-RESULT', item.text);
            } else if (item.type === 'image') {
              content.push({
                type: 'image',
                source: { type: 'base64', media_type: item.mimeType || 'image/png', data: item.data },
              });
              log('VNC-RESULT', '[screenshot]');
              saveScreenshot(item.data);
            }
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content });
        } catch (err) {
          log('VNC-ERROR', `${block.input.action}: ${err.message}`);
          toolResults.push({
            type: 'tool_result', tool_use_id: block.id,
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            is_error: true,
          });
        }
      }
    }

    if (toolResults.length === 0) {
      log('TEST', 'No tool calls — ending');
      break;
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  log('TEST', '\u2550'.repeat(60));
  log('TEST', 'FAILED \u2014 Max turns reached');
  log('TEST', '\u2550'.repeat(60));

  await mcp.close();
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
