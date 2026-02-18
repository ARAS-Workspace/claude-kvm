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
      `Control a remote macOS desktop via VNC. Display: ${width}×${height}px.`,
      'All coordinates are in this scaled space.',
      '',
      'ACTIONS:',
      '  screenshot                              → returns scaled PNG image',
      '  cursor_crop                             → 300×300 crop around cursor with crosshair',
      '  diff_check                              → detect screen changes since last baseline',
      '  set_baseline                            → save current screen for diff comparison',
      '  mouse_click    {x, y, button?}          → click at position (button: left|right|middle)',
      '  mouse_double_click {x, y}               → double-click at position',
      '  mouse_move     {x, y}                   → move cursor',
      '  hover          {x, y}                   → move cursor + wait 400ms',
      '  nudge          {dx, dy}                 → relative cursor move',
      '  mouse_drag     {x, y, toX, toY}         → drag from start to end',
      '  scroll         {x, y, direction, amount?} → scroll (direction: up|down|left|right)',
      '  key_tap        {key}                    → press key (enter|escape|tab|space|backspace|delete|f1-f12|up|down|left|right|...)',
      '  key_combo      {key}                    → key combination (e.g. "cmd+space", "ctrl+c")',
      '  key_type       {text}                   → type text character by character',
      '  paste          {text}                   → paste text via clipboard',
      '  vlm_prompt     {payload, x?, y?, width?, height?} → OCR/describe screen or region',
      '  wait           {ms}                     → pause (100-5000ms)',
      '  health                                  → connection status + display info',
      '',
      'Use screenshot → analyze → act → verify pattern.',
    ].join('\n'),
    inputSchema: {
      action: z.enum([
        'screenshot', 'cursor_crop', 'diff_check', 'set_baseline',
        'mouse_click', 'mouse_double_click', 'mouse_move', 'hover', 'nudge',
        'mouse_drag', 'scroll',
        'key_tap', 'key_combo', 'key_type', 'paste',
        'vlm_prompt', 'wait', 'health',
      ]).describe('The action to perform'),
      x: z.number().int().min(0).max(width - 1).optional().describe('X coordinate'),
      y: z.number().int().min(0).max(height - 1).optional().describe('Y coordinate'),
      toX: z.number().int().min(0).max(width - 1).optional().describe('Drag target X'),
      toY: z.number().int().min(0).max(height - 1).optional().describe('Drag target Y'),
      dx: z.number().int().min(-50).max(50).optional().describe('Relative X offset (nudge)'),
      dy: z.number().int().min(-50).max(50).optional().describe('Relative Y offset (nudge)'),
      width: z.number().int().min(1).max(width).optional().describe('Crop region width (vlm_prompt)'),
      height: z.number().int().min(1).max(height).optional().describe('Crop region height (vlm_prompt)'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button'),
      key: z.string().optional().describe('Key name or combo string'),
      text: z.string().optional().describe('Text to type or paste'),
      payload: z.string().optional().describe('VLM prompt text'),
      direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction'),
      amount: z.number().int().min(1).max(10).optional().describe('Scroll amount'),
      ms: z.number().int().min(100).max(5000).optional().describe('Wait duration in ms'),
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
