// SPDX-License-Identifier: MIT
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SCREENSHOTS_DIR, CONNECT_RETRIES, CONNECT_RETRY_DELAY } from './config.js';
import { log, saveScreenshot } from './log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(__dirname, '..', '..', 'index.js');

export async function connectMCP() {
  let mcp;
  let screenWidth = 1280;
  let screenHeight = 720;
  let vncTool = null;

  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
    log('CONN', `Attempt ${attempt}/${CONNECT_RETRIES}...`);

    try {
      const transport = new StdioClientTransport({
        command: 'node',
        args: [indexPath],
        env: { ...process.env, SCREENSHOTS_DIR },
      });

      mcp = new Client({ name: 'integration-test', version: '1.0.0' });
      await mcp.connect(transport);

      // Get tool schemas
      const toolsResult = await mcp.listTools();
      const mcpTools = toolsResult.tools;
      log('MCP', `Tools: ${mcpTools.map(t => t.name).join(', ')}`);

      // Extract vnc_command schema for Claude
      const vnc = mcpTools.find(t => t.name === 'vnc_command');
      if (vnc) {
        vncTool = {
          name: vnc.name,
          description: vnc.description,
          input_schema: vnc.inputSchema || { type: 'object', properties: {} },
        };
      }

      // Health check
      const health = await mcp.callTool({ name: 'vnc_command', arguments: { action: 'health' } });
      const healthText = health.content?.[0]?.text || '';
      if (healthText.includes('Error') || healthText.includes('not ready')) {
        log('CONN', `Daemon not connected: ${healthText}`);
        try { await mcp.close(); } catch {}
        if (attempt === CONNECT_RETRIES) {
          log('CONN', 'All retries exhausted');
          process.exit(1);
        }
        log('CONN', `Retrying in ${CONNECT_RETRY_DELAY / 1000}s...`);
        await sleep(CONNECT_RETRY_DELAY);
        continue;
      }

      // Parse display dimensions
      for (const item of health.content) {
        if (item.type === 'text') {
          const dimMatch = item.text.match(/display:\s*(\d+)[×x](\d+)/);
          if (dimMatch) {
            screenWidth = parseInt(dimMatch[1]);
            screenHeight = parseInt(dimMatch[2]);
          }
        }
      }

      log('MCP', `Daemon OK — ${screenWidth}×${screenHeight}`);
      break;
    } catch (err) {
      log('CONN', `Failed: ${err.message}`);
      try { await mcp?.close(); } catch {}

      if (attempt === CONNECT_RETRIES) {
        log('CONN', 'All retries exhausted');
        process.exit(1);
      }

      log('CONN', `Retrying in ${CONNECT_RETRY_DELAY / 1000}s...`);
      await sleep(CONNECT_RETRY_DELAY);
    }
  }

  return { mcp, vncTool, screenWidth, screenHeight };
}

/**
 * Take a screenshot via MCP and save to disk.
 * @returns {Promise<string>} base64 PNG data
 */
export async function takeScreenshot(mcp) {
  const result = await mcp.callTool({
    name: 'vnc_command',
    arguments: { action: 'screenshot' },
  });

  for (const item of result.content) {
    if (item.type === 'image') {
      saveScreenshot(item.data);
      return item.data;
    }
  }

  throw new Error('No image in screenshot result');
}