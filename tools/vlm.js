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
 * VLM (Vision Language Model) tool definitions.
 * Only registered when CLAUDE_KVM_VLM_TOOL_PATH environment variable is set.
 *
 * @param {import('../lib/types.js').ScaledDisplay} display
 * @returns {Array<{name: string, description: string, inputSchema: Record<string, import('zod').ZodType>}>}
 */
export function vlmTools(display) {
  const { width, height } = display;

  return [
    {
      name: 'vlm_query',
      description: [
        'Run an on-device Vision Language Model on a cropped region of the screen.',
        `Coordinates are in screen space (${width}×${height}px). Specify a rectangular region with (x, y, width, height).`,
        '',
        'Use cases:',
        '- Read text from a specific UI element (OCR)',
        '- Describe what is visible in a region',
        '- Identify icons, colors, or visual states in a small area',
        '- Answer visual questions about a cropped portion of the screen',
        '',
        'Tips:',
        '- Keep the crop region focused and small for faster/better results.',
        '- The prompt should be a clear question or instruction about the cropped image.',
        '- Runs locally on Apple Silicon — no network latency, but inference takes a few seconds.',
        '- Use verbose=true for timing/debug info on stderr.',
        '- macOS only.',
      ].join('\n'),
      inputSchema: {
        x: z.number().int().min(0).max(width - 1).describe('Left edge X coordinate of the crop region'),
        y: z.number().int().min(0).max(height - 1).describe('Top edge Y coordinate of the crop region'),
        width: z.number().int().min(1).max(width).describe('Width of the crop region in pixels'),
        height: z.number().int().min(1).max(height).describe('Height of the crop region in pixels'),
        prompt: z.string().min(1).describe('Question or instruction for the VLM about the cropped image'),
        max_tokens: z.number().int().min(1).max(4096).optional().describe('Maximum tokens in VLM response (default: 1024)'),
        verbose: z.boolean().optional().describe('Enable verbose logging to stderr for timing and debug info'),
      },
    },
  ];
}
