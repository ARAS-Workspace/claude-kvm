// SPDX-License-Identifier: MIT
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCREENSHOTS_DIR } from './config.js';

export function log(label, ...args) {
  const ts = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' });
  console.log(`[${ts}] [${label}]`, ...args);
}

let screenshotCount = 0;

export function saveScreenshot(base64Data) {
  screenshotCount++;
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const filename = `step-${String(screenshotCount).padStart(3, '0')}.png`;
  const filepath = resolve(SCREENSHOTS_DIR, filename);
  writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
  log('SAVE', filename);
}
