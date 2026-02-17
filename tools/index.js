// SPDX-License-Identifier: MIT
/**
 *  █████╗ ██████╗  █████╗ ███████╗
 * ██╔══██╗██╔══██╗██╔══██╗██╔════╝
 * ███████║██████╔╝███████║███████╗
 * ██╔══██║██╔══██╗██╔══██║╚════██║
 * ██║  ██║██║  ██║██║  ██║███████║
 * ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 *
 * Copyright (c) 2025 Rıza Emre ARAS <r.emrearas@proton.me>
 *
 * This file is part of Claude KVM.
 * Released under the MIT License — see LICENSE for details.
 */

import { screenTools } from './screen.js';
import { mouseTools } from './mouse.js';
import { keyboardTools } from './keyboard.js';
import { controlTools } from './control.js';
import { sshTools } from './ssh.js';
import { vlmTools } from './vlm.js';

/**
 * Aggregate all KVM tool definitions.
 * @param {import('../lib/types.js').ScaledDisplay} display
 * @param {object} [options]
 * @param {boolean} [options.sshEnabled] - Whether SSH is configured
 * @param {boolean} [options.vlmEnabled] - Whether VLM tool is available
 * @returns {Array<{name: string, description: string, inputSchema: object}>}
 */
export function getToolDefinitions(display, options = {}) {
  const tools = [
    ...screenTools(),
    ...mouseTools(display),
    ...keyboardTools(),
    ...controlTools(),
  ];

  if (options.sshEnabled) {
    tools.push(...sshTools());
  }

  if (options.vlmEnabled) {
    tools.push(...vlmTools(display));
  }

  return tools;
}
