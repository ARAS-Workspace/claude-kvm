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
 * Flow control tool definitions.
 * @returns {Array<{name: string, description: string, inputSchema: Record<string, import('zod').ZodType>}>}
 */
export function controlTools() {
  return [
    {
      name: 'wait',
      description: 'Wait before the next action. Use when waiting for a page load, animation, or response.\nDo NOT use wait between simple actions (click, type) — only when the remote system needs time to process (page navigation, app launch).',
      inputSchema: {
        ms: z.number().int().min(100).max(5000).describe('Duration in milliseconds (100–5000)'),
      },
    },
    {
      name: 'health_check',
      description: [
        'Check VNC connection status and server info.',
        'Returns connection state, resolution, latency, reconnect count, and memory usage.',
        'Use when you suspect the connection may be unstable or to diagnose issues.',
      ].join('\n'),
      inputSchema: null,
    },
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
