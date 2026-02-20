// SPDX-License-Identifier: MIT
/**
 *  █████╗ ██████╗  █████╗ ███████╗
 * ██╔══██╗██╔══██╗██╔══██╗██╔════╝
 * ███████║██████╔╝███████║███████╗
 * ██╔══██║██╔══██╗██╔══██║╚════██║
 * ██║  ██║██║  ██║██║  ██║███████║
 * ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 *
 * Copyright (c) 2026 Rıza Emre ARAS <r.emrearas@proton.me>
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
      '  detect_elements                         → OCR text detection with bounding boxes',
      '  configure      {<params>}               → set timing/display params at runtime',
      '  configure      {reset: true}            → reset all params to defaults',
      '  get_timing                              → get current timing + display params',
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
        'detect_elements',
        'configure', 'get_timing',
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
      // Configure params (runtime timing/display adjustment)
      reset: z.boolean().optional().describe('Reset all params to defaults'),
      max_dimension: z.number().int().min(320).max(3840).optional().describe('Max screenshot dimension'),
      cursor_crop_radius: z.number().int().min(50).max(500).optional().describe('Cursor crop radius'),
      click_hold_ms: z.number().int().min(1).max(500).optional().describe('Click hold duration'),
      double_click_gap_ms: z.number().int().min(1).max(500).optional().describe('Double-click gap'),
      hover_settle_ms: z.number().int().min(1).max(2000).optional().describe('Hover settle wait'),
      drag_position_ms: z.number().int().min(1).max(500).optional().describe('Pre-drag position wait'),
      drag_press_ms: z.number().int().min(1).max(500).optional().describe('Drag press hold'),
      drag_step_ms: z.number().int().min(1).max(100).optional().describe('Between interpolation pts'),
      drag_settle_ms: z.number().int().min(1).max(500).optional().describe('Settle before release'),
      drag_pixels_per_step: z.number().min(1).max(100).optional().describe('Point density per pixel'),
      drag_min_steps: z.number().int().min(1).max(100).optional().describe('Min interpolation steps'),
      scroll_press_ms: z.number().int().min(1).max(200).optional().describe('Scroll press-release gap'),
      scroll_tick_ms: z.number().int().min(1).max(200).optional().describe('Inter-tick delay'),
      key_hold_ms: z.number().int().min(1).max(500).optional().describe('Key hold duration'),
      combo_mod_ms: z.number().int().min(1).max(200).optional().describe('Modifier settle delay'),
      type_key_ms: z.number().int().min(1).max(200).optional().describe('Key hold during typing'),
      type_inter_key_ms: z.number().int().min(1).max(200).optional().describe('Inter-character delay'),
      type_shift_ms: z.number().int().min(1).max(200).optional().describe('Shift key settle'),
      paste_settle_ms: z.number().int().min(1).max(500).optional().describe('Post-clipboard write wait'),
    },
  };
}

/**
 * Build action_queue tool definition with display dimensions.
 * Executes multiple VNC actions in sequence, returns text-only results.
 * @param {number} width  - Scaled display width
 * @param {number} height - Scaled display height
 */
export function actionQueueTool(width, height) {
  const queueAction = z.object({
    action: z.enum([
      'mouse_click', 'mouse_double_click', 'mouse_move', 'hover', 'nudge',
      'mouse_drag', 'scroll',
      'key_tap', 'key_combo', 'key_type', 'paste',
      'set_baseline', 'diff_check',
      'wait',
    ]).describe('The action to perform'),
    x: z.number().int().min(0).max(width - 1).optional().describe('X coordinate'),
    y: z.number().int().min(0).max(height - 1).optional().describe('Y coordinate'),
    toX: z.number().int().min(0).max(width - 1).optional().describe('Drag target X'),
    toY: z.number().int().min(0).max(height - 1).optional().describe('Drag target Y'),
    dx: z.number().int().min(-50).max(50).optional().describe('Relative X offset (nudge)'),
    dy: z.number().int().min(-50).max(50).optional().describe('Relative Y offset (nudge)'),
    button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button'),
    key: z.string().optional().describe('Key name or combo string (e.g. "ctrl+c")'),
    keys: z.array(z.string()).optional().describe('Array of key names for combo'),
    text: z.string().optional().describe('Text to type or paste'),
    direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction'),
    amount: z.number().int().min(1).max(20).optional().describe('Scroll amount (default 3)'),
    ms: z.number().int().min(50).max(10000).optional().describe('Wait duration in ms (default 500)'),
  });

  return {
    name: 'action_queue',
    description: [
      'Execute multiple VNC actions in sequence. Returns text results only (no screenshots).',
      'Stops on first error. Use for batching confident action sequences.',
      '',
      'Examples:',
      '  Navigate: [click(640,91), ctrl+a, paste("url"), return]',
      '  Scroll:   [click(640,400), pagedown, pagedown, pagedown]',
      '  Type:     [click(300,200), key_type("hello"), tab, key_type("world")]',
    ].join('\n'),
    inputSchema: {
      actions: z.array(queueAction).min(1).max(20).describe('Ordered actions to execute sequentially'),
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
