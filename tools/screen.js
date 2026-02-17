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
 * Screen instrument definitions.
 *
 * @returns {Array<{name: string, description: string, inputSchema: null}>}
 */
export function screenTools() {
  return [
    {
      name: 'screenshot',
      description: [
        'Capture the full screen. Use to observe current state before acting.',
        'IMPORTANT: Do NOT take a screenshot after every action. Only use when you need to:',
        '- See the initial state of the screen',
        '- Verify a complex visual result (page loaded, UI changed significantly)',
        '- Read text or identify UI elements for the next action',
        'For simple verifications, prefer diff_check (text-only, ~5ms) or cursor_crop (small image).',
      ].join('\n'),
      inputSchema: null,
    },
    {
      name: 'cursor_crop',
      description: [
        'Capture a small crop around the current cursor position.',
        'Returns cursor coordinates and a cropped image with a red crosshair marking the cursor.',
        'Use to verify cursor placement on small targets (buttons, links, icons).',
        'Much cheaper than a full screenshot — prefer this for position verification.',
      ].join('\n'),
      inputSchema: null,
    },
    {
      name: 'diff_check',
      description: [
        'Lightweight screen change detection. Compares current frame against the baseline.',
        'Returns change percentage as text — no image. Fast (~5-10ms).',
        'Use after actions to verify if something changed without the cost of a full screenshot.',
        'Updates the baseline after comparison.',
        'Typical workflow: set_baseline → action → diff_check → if changed, screenshot only if needed.',
      ].join('\n'),
      inputSchema: null,
    },
    {
      name: 'set_baseline',
      description: [
        'Save current screen as the diff baseline.',
        'Call before an action so diff_check can measure what changed after it.',
      ].join('\n'),
      inputSchema: null,
    },
  ];
}
