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
 * Mouse instrument definition.
 *
 * @param {import('../../lib/types.js').ScaledDisplay} display
 * @returns {import('@anthropic-ai/sdk').Tool[]}
 */
export function mouseTools(display) {
  const { width, height } = display;

  return [
    {
      name: 'mouse',
      description: [
        `Mouse control. Screen: ${width}x${height}px, origin (0,0) at top-left.`,
        '',
        'Actions:',
        '- move: Move cursor to (x,y). Returns a crop with crosshair showing cursor position.',
        '- nudge: Offset cursor by (dx,dy) relative to current position. Returns updated crop.',
        '- click: Left-click at current cursor position.',
        '- click_at: Move to (x,y) and left-click in one step. For large targets.',
        '- right_click: Right-click at current position.',
        '- double_click: Double-click at current position.',
        '- drag: Hold and drag from current position to (x,y).',
        '- scroll: Scroll at current position.',
        '- peek: View crop around cursor without acting.',
      ].join('\n'),
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['move', 'nudge', 'click', 'click_at', 'right_click', 'double_click', 'drag', 'scroll', 'peek'],
          },
          x: { type: 'integer', minimum: 0, maximum: width - 1, description: 'X coordinate. For: move, click_at, drag.' },
          y: { type: 'integer', minimum: 0, maximum: height - 1, description: 'Y coordinate. For: move, click_at, drag.' },
          dx: { type: 'integer', minimum: -20, maximum: 20, description: 'Horizontal offset. For: nudge.' },
          dy: { type: 'integer', minimum: -20, maximum: 20, description: 'Vertical offset. For: nudge.' },
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'For: scroll.' },
          amount: { type: 'integer', minimum: 1, maximum: 10, description: 'Scroll steps. For: scroll.' },
        },
        required: ['action'],
      },
    },
  ];
}
