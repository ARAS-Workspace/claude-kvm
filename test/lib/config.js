// SPDX-License-Identifier: MIT
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = resolve(__dirname, '..');

export function loadFile(name, envVar) {
  if (envVar && process.env[envVar]) return process.env[envVar];
  return readFileSync(resolve(testDir, name), 'utf-8').trim();
}

export function loadPrompt(agent) {
  return readFileSync(resolve(testDir, 'agents', agent, 'system_prompt.md'), 'utf-8').trim();
}

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-6';
export const OBSERVER_MODEL = process.env.OBSERVER_MODEL || 'qwen/qwen3-vl-235b-a22b-instruct';
export const MAX_TURNS = parseInt(process.env.MAX_TURNS || '25', 10);
export const TASK = loadFile('test_prompt.md', 'TASK');
export const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || './test-screenshots';
export const CONNECT_RETRIES = parseInt(process.env.CONNECT_RETRIES || '12', 10);
export const CONNECT_RETRY_DELAY = parseInt(process.env.CONNECT_RETRY_DELAY || '10000', 10);