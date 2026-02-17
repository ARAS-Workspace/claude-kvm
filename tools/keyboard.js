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

import { z } from 'zod';

/**
 * Keyboard instrument definition.
 *
 * @returns {Array<{name: string, description: string, inputSchema: Record<string, import('zod').ZodType>}>}
 */
export function keyboardTools() {
  return [
    {
      name: 'keyboard',
      description: [
        'Keyboard control.',
        '',
        'Actions:',
        '- press: Press a single key. Param: key.',
        '  Named keys: enter, escape, tab, backspace, delete, space,',
        '  up, down, left, right, home, end, pageup, pagedown, f1–f12.',
        '- combo: Key combination with "+" separator. Param: keys.',
        '  Modifiers: ctrl, alt, shift, meta. Examples: ctrl+c, ctrl+l.',
        '- type: Type text character by character. Param: text.',
        '- paste: Paste text via clipboard. Param: text. Faster and more reliable for long text or special characters.',
      ].join('\n'),
      inputSchema: {
        action: z.enum(['press', 'combo', 'type', 'paste']),
        key: z.string().describe('Key name. For: press.').optional(),
        keys: z.string().describe('Key combo (e.g. "ctrl+c"). For: combo.').optional(),
        text: z.string().describe('Text to type. For: type, paste.').optional(),
      },
    },
  ];
}
