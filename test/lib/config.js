// SPDX-License-Identifier: MIT
// noinspection JSUnresolvedReference
// noinspection JSUnresolvedVariable

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

export function loadPrompt(agent, name = 'system_prompt') {
  return readFileSync(resolve(testDir, 'agents', agent, `${name}.md`), 'utf-8').trim();
}

// API keys
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Models
export const EXECUTOR_MODEL = process.env.EXECUTOR_MODEL || 'claude-opus-4-6';
export const OBSERVER_MODEL = process.env.OBSERVER_MODEL || 'qwen/qwen3-vl-235b-a22b-instruct';

// Turn limits
export const EXECUTOR_MAX_TURNS = parseInt(process.env.EXECUTOR_MAX_TURNS || '30', 10);

// Task
export const TASK = loadFile('test_prompt.md', 'TASK');

// Connection
export const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || './test-screenshots';
export const CONNECT_RETRIES = parseInt(process.env.CONNECT_RETRIES || '12', 10);
export const CONNECT_RETRY_DELAY = parseInt(process.env.CONNECT_RETRY_DELAY || '10000', 10);