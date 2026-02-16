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

/**
 * Aggregate all KVM tool definitions.
 * @param {import('../lib/types.js').ScaledDisplay} display
 * @returns {Array<{name: string, description: string, inputSchema: object}>}
 */
export function getToolDefinitions(display) {
  return [
    ...screenTools(),
    ...mouseTools(display),
    ...keyboardTools(),
    ...controlTools(),
  ];
}
