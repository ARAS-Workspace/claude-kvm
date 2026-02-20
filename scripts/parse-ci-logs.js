#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Parses extracted CI log directory, finds step logs,
 * computes recording sync timestamps, and extracts test log lines.
 *
 * Usage: node parse-ci-logs.js <logs-dir>
 *
 * Outputs to stdout (for GitHub Actions):
 *   OFFSET=<seconds>     — trim offset from recording start to test start
 *   DURATION=<seconds>   — test duration
 *
 * Writes: test-logs.txt  — filtered test log lines
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit, stderr } from 'node:process';

const logsDir = argv[2];
if (!logsDir) {
  stderr.write('Usage: node parse-ci-logs.js <logs-dir>\n');
  exit(1);
}

// ── Recursively collect all files ────────────────────────

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const allFiles = walk(logsDir);
stderr.write(`Found ${allFiles.length} log files\n`);

// ── Find step log files by content ───────────────────────

let recFile = null;
let testFile = null;

for (const file of allFiles) {
  const content = readFileSync(file, 'utf8');
  if (!recFile && content.includes('Screen recording started')) {
    recFile = { path: file, content };
  }
  if (!testFile && content.includes('[TEST] Starting')) {
    testFile = { path: file, content };
  }
  if (recFile && testFile) break;
}

if (!testFile) {
  stderr.write('Error: Could not find test log (no [TEST] Starting)\n');
  exit(1);
}
stderr.write(`Recording step: ${recFile?.path || 'NOT FOUND'}\n`);
stderr.write(`Test step: ${testFile.path}\n`);

// ── Extract test log lines ───────────────────────────────

const testLogPattern = /\[\d{2}:\d{2}:\d{2}] \[[A-Z][-A-Z]*] .+/g;
const testLines = testFile.content.match(testLogPattern) || [];
writeFileSync('test-logs.txt', testLines.join('\n') + '\n');
stderr.write(`Test log lines: ${testLines.length}\n`);

// ── Parse ISO timestamps for sync ────────────────────────

function parseISO(line) {
  const m = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return m ? new Date(m[1] + 'Z') : null;
}

// Recording start: last line containing "Screen recording started" (skip echo command display)
let recStartDate = null;
if (recFile) {
  const recLines = recFile.content.split('\n').filter(l => l.includes('Screen recording started'));
  const lastRecLine = recLines[recLines.length - 1];
  recStartDate = lastRecLine ? parseISO(lastRecLine) : null;
}

// Test start: first [INIT] line
const initLine = testFile.content.split('\n').find(l => l.includes('[INIT]'));
const testStartDate = initLine ? parseISO(initLine) : null;

// Test end: last [TEST] PASSED or FAILED line
const testEndLines = testFile.content.split('\n').filter(l => /\[TEST].*(?:PASSED|FAILED)/.test(l));
const testEndDate = testEndLines.length ? parseISO(testEndLines[testEndLines.length - 1]) : null;

stderr.write(`Recording started: ${recStartDate?.toISOString() || 'N/A'}\n`);
stderr.write(`Test started: ${testStartDate?.toISOString() || 'N/A'}\n`);
stderr.write(`Test ended: ${testEndDate?.toISOString() || 'N/A'}\n`);

// ── Compute offset and duration ──────────────────────────

let offset = 0;
let duration = 1;

if (recStartDate && testStartDate) {
  offset = Math.max(0, Math.round((testStartDate - recStartDate) / 1000));
}
if (testStartDate && testEndDate) {
  duration = Math.max(1, Math.round((testEndDate - testStartDate) / 1000));
}

stderr.write(`OFFSET=${offset}s  DURATION=${duration}s\n`);

// Output for GitHub Actions
console.log(`OFFSET=${offset}`);
console.log(`DURATION=${duration}`);