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
 * Build vnc_command tool definition with display dimensions.
 * @param {number} width  - Scaled display width
 * @param {number} height - Scaled display height
 */
export function vncCommandTool(width, height) {
  return {
    name: 'vnc_command',
    description: [
      `Control a remote desktop via VNC. Display: ${width}×${height}px.`,
      'All coordinates are in this scaled space.',
      '',
      'ACTIONS:',
      '  screenshot                              → full screen PNG',
      '  cursor_crop                             → crop around cursor with crosshair',
      '  diff_check                              → detect screen changes since baseline',
      '  set_baseline                            → save current screen for diff comparison',
      '  mouse_click    {x, y, button?}          → click (left|right|middle)',
      '  mouse_double_click {x, y}               → double click',
      '  mouse_move     {x, y}                   → move cursor',
      '  hover          {x, y}                   → move cursor + settle wait',
      '  nudge          {dx, dy}                 → relative cursor move',
      '  mouse_drag     {x, y, toX, toY}         → drag from start to end',
      '  scroll         {x, y, direction, amount?} → scroll (up|down|left|right)',
      '  key_tap        {key}                    → single key press (enter|escape|tab|space|...)',
      '  key_combo      {key} or {keys:[...]}    → modifier combo (e.g. "cmd+c" or ["cmd","shift","3"])',
      '  key_type       {text}                   → type text character by character',
      '  paste          {text}                   → paste text via clipboard',
      '  wait           {ms?}                    → pause (default 500ms)',
      '  health                                  → connection status + display info',
      '  shutdown                                → graceful daemon exit',
      '',
      'Use screenshot → analyze → act → verify pattern.',
    ].join('\n'),
    inputSchema: {
      action: z.enum([
        'screenshot', 'cursor_crop', 'diff_check', 'set_baseline',
        'mouse_click', 'mouse_double_click', 'mouse_move', 'hover', 'nudge',
        'mouse_drag', 'scroll',
        'key_tap', 'key_combo', 'key_type', 'paste',
        'wait', 'health', 'shutdown',
      ]).describe('The action to perform'),
      x: z.number().int().min(0).max(width - 1).optional().describe('X coordinate'),
      y: z.number().int().min(0).max(height - 1).optional().describe('Y coordinate'),
      toX: z.number().int().min(0).max(width - 1).optional().describe('Drag target X'),
      toY: z.number().int().min(0).max(height - 1).optional().describe('Drag target Y'),
      dx: z.number().int().min(-50).max(50).optional().describe('Relative X offset (nudge)'),
      dy: z.number().int().min(-50).max(50).optional().describe('Relative Y offset (nudge)'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button'),
      key: z.string().optional().describe('Key name or combo string (e.g. "cmd+c")'),
      keys: z.array(z.string()).optional().describe('Array of key names for combo (e.g. ["cmd","shift","3"])'),
      text: z.string().optional().describe('Text to type or paste'),
      direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction'),
      amount: z.number().int().min(1).max(20).optional().describe('Scroll amount (default 3)'),
      ms: z.number().int().min(50).max(10000).optional().describe('Wait duration in ms (default 500)'),
    },
  };
}

/**
 * Control tools (task lifecycle).
 */
export function controlTools() {
  return [
    {
      name: 'task_complete',
      description: 'Mark the task as successfully completed. Provide a brief summary.',
      inputSchema: {
        summary: z.string().describe('What was accomplished'),
      },
    },
    {
      name: 'task_failed',
      description: 'Mark the task as failed. Explain why.',
      inputSchema: {
        reason: z.string().describe('Why the task could not be completed'),
      },
    },
  ];
}
