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
 * Flow control tool definitions.
 * @returns {import('@anthropic-ai/sdk').Tool[]}
 */
export function controlTools() {
  return [
    {
      name: 'wait',
      description: 'Wait before the next action. Use when waiting for a page load, animation, or response.',
      input_schema: {
        type: 'object',
        properties: {
          ms: { type: 'integer', description: 'Duration in milliseconds (100–5000)', minimum: 100, maximum: 5000 },
        },
        required: ['ms'],
      },
    },
    {
      name: 'task_complete',
      description: 'Mark the task as successfully completed. Provide a brief summary.',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'What was accomplished' },
        },
        required: ['summary'],
      },
    },
    {
      name: 'task_failed',
      description: 'Mark the task as failed. Explain why.',
      input_schema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why the task could not be completed' },
        },
        required: ['reason'],
      },
    },
  ];
}
