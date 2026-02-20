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
 * Integration test — Claude orchestrator with full VNC access + vision observer.
 *
 * Claude is the primary agent with direct VNC control.
 * The observer (Qwen3-VL) provides screen state verification via verify().
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY   — required (Claude)
 *   OPENROUTER_API_KEY  — optional (observer — Claude can work without it)
 *   CLAUDE_MODEL        — orchestrator (default: claude-opus-4-6)
 *   OBSERVER_MODEL      — vision observer for verify() (default: qwen/qwen3-vl-235b-a22b-instruct)
 *   MAX_TURNS           — max Claude turns (default: 25)
 *   VNC_HOST / VNC_PORT / VNC_PASSWORD / VNC_USERNAME
 *   SCREENSHOTS_DIR     — screenshot output (default: ./test-screenshots)
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ANTHROPIC_API_KEY, OPENROUTER_API_KEY,
  CLAUDE_MODEL, OBSERVER_MODEL,
  MAX_TURNS, TASK,
} from './lib/config.js';
import { loadPrompt } from './lib/config.js';
import { log, saveScreenshot } from './lib/log.js';
import { connectMCP } from './lib/mcp.js';
import { observe } from './lib/observer.js';

// ── Claude Tools ───────────────────────────────────────────

/** @type {import('@anthropic-ai/sdk').Tool[]} */
const CUSTOM_TOOLS = [
  {
    name: 'verify',
    description: 'Ask a question about the current screen state. Takes a screenshot internally and sends it to the vision observer. Returns a concise text answer (1-3 sentences). Use instead of screenshot to save context.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'What to check, e.g. "Is Firefox open?", "What URL is in the address bar?"',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'task_complete',
    description: 'Call when the task is fully completed.',
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
    description: 'Call when the task cannot be completed.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why the task failed' },
      },
      required: ['reason'],
    },
  },
];

// ── Main ───────────────────────────────────────────────────

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
  const systemPrompt = loadPrompt('claude');

  // Combine MCP tools + custom tools
  const mcpToolsResult = await mcp.listTools();
  const mcpTools = mcpToolsResult.tools
    .filter(t => t.name !== 'task_complete' && t.name !== 'task_failed')
    .map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema || { type: 'object', properties: {} },
    }));
  const tools = [...mcpTools, ...CUSTOM_TOOLS];

  log('INIT', `Tools: ${tools.map(t => t.name).join(', ')}`);
  log('INIT', `Claude: ${CLAUDE_MODEL}`);
  log('INIT', `Observer: ${OBSERVER_MODEL}${OPENROUTER_API_KEY ? '' : ' (no key — disabled)'}`);
  log('INIT', `Turns: ${MAX_TURNS}`);
  log('INIT', `Display: ${screenWidth}×${screenHeight}`);
  log('INIT', `Task: ${TASK.slice(0, 120)}...`);

  log('TEST', '\u2550'.repeat(60));
  log('TEST', 'Starting — Claude + Observer');
  log('TEST', '\u2550'.repeat(60));

  /** @type {import('@anthropic-ai/sdk').MessageParam[]} */
  const messages = [{ role: 'user', content: [{ type: 'text', text: TASK }] }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    log('TURN', `${turn}/${MAX_TURNS}`);

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools,
    });

    let hasToolUse = false;
    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        log('CLAUDE', block.text);
      }

      if (block.type === 'tool_use') {
        hasToolUse = true;

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

        // ── Verify (Observer) ──
        if (block.name === 'verify') {
          log('VERIFY', block.input.question);

          const answer = await observe(block.input.question, mcp);
          log('VERIFY-RESULT', answer);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: [{ type: 'text', text: answer }],
          });
        }

        // ── Action Queue ──
        if (block.name === 'action_queue') {
          log('QUEUE', `${block.input.actions.length} actions`);

          try {
            const result = await mcp.callTool({
              name: 'action_queue',
              arguments: block.input,
            });

            const text = result.content?.[0]?.text || 'OK';
            log('QUEUE-RESULT', text);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: [{ type: 'text', text }],
            });
          } catch (err) {
            log('QUEUE-ERROR', err.message);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              is_error: true,
            });
          }
        }

        // ── Direct VNC ──
        if (block.name === 'vnc_command') {
          log('VNC', `${block.input.action}(${JSON.stringify(block.input)})`);

          try {
            const result = await mcp.callTool({
              name: 'vnc_command',
              arguments: block.input,
            });

            const content = [];
            for (const item of result.content) {
              if (item.type === 'text') {
                content.push({ type: 'text', text: item.text });
                log('VNC-RESULT', item.text);
              } else if (item.type === 'image') {
                content.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: item.mimeType || 'image/png',
                    data: item.data,
                  },
                });
                log('VNC-RESULT', '[screenshot]');
                saveScreenshot(item.data);
              }
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content,
            });
          } catch (err) {
            log('VNC-ERROR', `${block.input.action}: ${err.message}`);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              is_error: true,
            });
          }
        }
      }
    }

    if (!hasToolUse) {
      log('TEST', 'No tool calls \u2014 ending');
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