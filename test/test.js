#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// noinspection JSUnresolvedReference
// noinspection JSUnresolvedVariable
/**
 * Test runner proxy — loads a prompt file and runs integration.js
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptFile = process.argv[2];

if (promptFile) {
  const promptPath = resolve(__dirname, promptFile);
  process.env.TASK = readFileSync(promptPath, 'utf-8').trim();
}

await import('./integration.js');
