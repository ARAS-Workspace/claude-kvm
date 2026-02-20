// SPDX-License-Identifier: MIT
import Anthropic from '@anthropic-ai/sdk';
import { EXECUTOR_MODEL, EXECUTOR_MAX_TURNS } from './config.js';
import { loadPrompt } from './config.js';
import { log, saveScreenshot } from './log.js';
import { takeScreenshot } from './mcp.js';
import { observe } from './observer.js';

const anthropic = new Anthropic();
const systemPrompt = loadPrompt('executor');

const REPORT_TOOL = {
  name: 'report',
  description: 'Report the result back to the planner. Call when instruction is completed or when you cannot proceed.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'What you did and what you observed' },
      status: { type: 'string', enum: ['success', 'error'], description: 'success if completed, error if failed' },
    },
    required: ['summary', 'status'],
  },
};

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

/**
 * Execute a sub-task with fresh context.
 * Takes an initial screenshot, runs the executor loop, returns a report.
 *
 * @param {string} instruction - What to do (from planner)
 * @param {object} mcp - MCP client
 * @param {Array} mcpTools - MCP tool schemas for the executor
 * @returns {Promise<{summary: string, status: string}>}
 */
export async function executeSubTask(instruction, mcp, mcpTools) {
  const screenshot = await takeScreenshot(mcp);

  const tools = [...mcpTools, VERIFY_TOOL, REPORT_TOOL];

  const messages = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot } },
      { type: 'text', text: instruction },
    ],
  }];

  for (let turn = 1; turn <= EXECUTOR_MAX_TURNS; turn++) {
    log('EXEC', `turn ${turn}/${EXECUTOR_MAX_TURNS}`);

    const response = await anthropic.messages.create({
      model: EXECUTOR_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      tools,
    });

    const toolResults = [];
    let reportResult = null;

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        log('EXEC', block.text);
      }

      if (block.type !== 'tool_use') {
        // skip non-tool blocks
      } else if (block.name === 'report') {
        reportResult = block.input;
        log('EXEC-REPORT', `[${block.input.status}] ${block.input.summary}`);
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: [{ type: 'text', text: 'Reported.' }],
        });
      } else if (block.name === 'verify') {
        log('VERIFY', block.input.question);
        const answer = await observe(block.input.question, mcp);
        log('VERIFY-RESULT', answer);
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: [{ type: 'text', text: answer }],
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

    if (reportResult) return reportResult;

    if (toolResults.length === 0) {
      const lastText = response.content.find(b => b.type === 'text')?.text || 'No action taken';
      return { summary: lastText, status: 'error' };
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return { summary: `Executor reached turn limit (${EXECUTOR_MAX_TURNS}) without completing`, status: 'error' };
}