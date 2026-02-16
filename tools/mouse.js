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
 * Mouse instrument definition.
 *
 * @param {import('../lib/types.js').ScaledDisplay} display
 * @returns {Array<{name: string, description: string, inputSchema: Record<string, import('zod').ZodType>}>}
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
      inputSchema: {
        action: z.enum(['move', 'nudge', 'click', 'click_at', 'right_click', 'double_click', 'drag', 'scroll', 'peek']),
        x: z.number().int().min(0).max(width - 1).describe('X coordinate. For: move, click_at, drag.').optional(),
        y: z.number().int().min(0).max(height - 1).describe('Y coordinate. For: move, click_at, drag.').optional(),
        dx: z.number().int().min(-20).max(20).describe('Horizontal offset. For: nudge.').optional(),
        dy: z.number().int().min(-20).max(20).describe('Vertical offset. For: nudge.').optional(),
        direction: z.enum(['up', 'down', 'left', 'right']).describe('For: scroll.').optional(),
        amount: z.number().int().min(1).max(10).describe('Scroll steps. For: scroll.').optional(),
      },
    },
  ];
}
