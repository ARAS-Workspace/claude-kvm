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
 * Hierarchical integration test — Planner + Executor + Observer.
 *
 * Opus (planner) breaks the task into sub-tasks and dispatches them.
 * Haiku (executor) executes each sub-task with fresh context and VNC access.
 * Qwen-VL (observer) provides independent screen verification via verify().
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY     — required
 *   OPENROUTER_API_KEY    — optional (observer)
 *   PLANNER_MODEL         — planner model (default: claude-opus-4-6)
 *   EXECUTOR_MODEL        — executor model (default: claude-haiku-4-5-20251001)
 *   OBSERVER_MODEL        — observer model (default: qwen/qwen3-vl-235b-a22b-instruct)
 *   PLANNER_MAX_TURNS     — max planner turns (default: 15)
 *   EXECUTOR_MAX_TURNS    — max executor turns per dispatch (default: 5)
 *   VNC_HOST / VNC_PORT / VNC_PASSWORD / VNC_USERNAME
 *   SCREENSHOTS_DIR       — screenshot output (default: ./test-screenshots)
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ANTHROPIC_API_KEY, OPENROUTER_API_KEY,
  PLANNER_MODEL, EXECUTOR_MODEL, OBSERVER_MODEL,
  PLANNER_MAX_TURNS, EXECUTOR_MAX_TURNS, TASK,
} from './lib/config.js';
import { loadPrompt } from './lib/config.js';
import { log } from './lib/log.js';
import { connectMCP } from './lib/mcp.js';
import { executeSubTask } from './lib/executor.js';

// ── Planner Tools ─────────────────────────────────────────

const PLANNER_TOOLS = [
  {
    name: 'dispatch',
    description: [
      'Send an instruction to the UI executor agent.',
      'The executor sees the current screen, performs VNC actions, verifies via observer, and reports back.',
      'Returns a text report: [success] or [error] with details.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'Clear, specific instruction for the executor',
        },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'task_complete',
    description: 'The entire task has been completed successfully.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'What was accomplished' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'task_failed',
    description: 'The task cannot be completed.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why the task failed' },
      },
      required: ['reason'],
    },
  },
];

// ── Main ──────────────────────────────────────────────────

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('Fatal: ANTHROPIC_API_KEY is required');
    process.exit(1);
  }

  if (!OPENROUTER_API_KEY) {
    log('WARN', 'OPENROUTER_API_KEY not set — verify() will be unavailable');
  }

  const { mcp, screenWidth, screenHeight } = await connectMCP();
  const anthropic = new Anthropic();
  const plannerPrompt = loadPrompt('planner');

  // Get MCP tools for executor
  const mcpToolsResult = await mcp.listTools();
  const mcpTools = mcpToolsResult.tools
    .filter(t => t.name !== 'task_complete' && t.name !== 'task_failed')
    .map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema || { type: 'object', properties: {} },
    }));

  log('INIT', `MCP tools: ${mcpTools.map(t => t.name).join(', ')}`);
  log('INIT', `Planner: ${PLANNER_MODEL} (max ${PLANNER_MAX_TURNS} turns)`);
  log('INIT', `Executor: ${EXECUTOR_MODEL} (max ${EXECUTOR_MAX_TURNS} turns/dispatch)`);
  log('INIT', `Observer: ${OBSERVER_MODEL}${OPENROUTER_API_KEY ? '' : ' (disabled)'}`);
  log('INIT', `Display: ${screenWidth}×${screenHeight}`);
  log('INIT', `Task: ${TASK.slice(0, 120)}...`);

  log('TEST', '\u2550'.repeat(60));
  log('TEST', 'Starting — Planner + Executor + Observer');
  log('TEST', '\u2550'.repeat(60));

  /** @type {import('@anthropic-ai/sdk').MessageParam[]} */
  const messages = [{ role: 'user', content: TASK }];

  for (let turn = 1; turn <= PLANNER_MAX_TURNS; turn++) {
    log('PLAN', `turn ${turn}/${PLANNER_MAX_TURNS}`);

    const response = await anthropic.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 2048,
      system: plannerPrompt,
      messages,
      tools: PLANNER_TOOLS,
    });

    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        log('PLANNER', block.text);
      }

      if (block.type !== 'tool_use') continue;

      // ── Terminal ──
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

      // ── Dispatch to executor ──
      if (block.name === 'dispatch') {
        log('DISPATCH', block.input.instruction);
        const result = await executeSubTask(block.input.instruction, mcp, mcpTools);
        const reportText = `[${result.status}] ${result.summary}`;
        log('DISPATCH-RESULT', reportText);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: [{ type: 'text', text: reportText }],
        });
      }
    }

    if (toolResults.length === 0) {
      log('TEST', 'No dispatch — ending');
      break;
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  log('TEST', '\u2550'.repeat(60));
  log('TEST', 'FAILED \u2014 Max planner turns reached');
  log('TEST', '\u2550'.repeat(60));

  await mcp.close();
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});