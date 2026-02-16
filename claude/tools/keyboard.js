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

/**
 * Keyboard instrument definition.
 *
 * @returns {import('@anthropic-ai/sdk').Tool[]}
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
      ].join('\n'),
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['press', 'combo', 'type'],
          },
          key: { type: 'string', description: 'Key name. For: press.' },
          keys: { type: 'string', description: 'Key combo (e.g. "ctrl+c"). For: combo.' },
          text: { type: 'string', description: 'Text to type. For: type.' },
        },
        required: ['action'],
      },
    },
  ];
}
