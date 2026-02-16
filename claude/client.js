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

import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude API Client.
 *
 * Manages multimodal conversations with the Claude Messages API,
 * including screenshot image blocks, tool use, and conversation history.
 */
export class ClaudeClient {
  /**
   * @param {import('../lib/types').ClaudeKVMConfig} config
   * @param {string} systemPrompt
   * @param {import('@anthropic-ai/sdk').Tool[]} tools
   * @param {import('../lib/types').ScaledDisplay} display
   */
  constructor(config, systemPrompt, tools, display) {
    this.config = config;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.display = display;
    /** @type {import('@anthropic-ai/sdk').MessageParam[]} */
    this.messages = [];
    this.historyWindow = config.loop.history_window || 5;
    this.client = new Anthropic();
  }

  /**
   * Send the initial message with a screenshot and task description.
   * @param {string} screenshotBase64
   * @param {string} task
   * @returns {Promise<import('@anthropic-ai/sdk').Message>}
   */
  async sendInitialMessage(screenshotBase64, task) {
    this.messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
          },
          {
            type: 'text',
            text: `Screen: ${this.display.width}x${this.display.height}\n\nTask: ${task}`,
          },
        ],
      },
    ];

    return this._sendRequest();
  }

  /**
   * Send a tool result back to Claude with a new screenshot.
   * @param {string} toolUseId
   * @param {string} resultText
   * @param {string | null} screenshotBase64
   * @param {import('../lib/types').FrameDiffResult | null} diff
   * @param {number} iteration
   * @param {number} maxIterations
   * @param {Array<object>} [extraImages] - Additional image blocks (e.g. cursor crop)
   * @returns {Promise<import('@anthropic-ai/sdk').Message>}
   */
  async sendToolResult(toolUseId, resultText, screenshotBase64, diff, iteration, maxIterations, extraImages) {
    const content = [];

    if (screenshotBase64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
      });
    }

    // Attach extra images (cursor crops, etc.)
    if (extraImages && extraImages.length > 0) {
      content.push(...extraImages);
    }

    let text = resultText;
    if (diff) {
      text += `\nScreen changed: ${diff.changePercent > this.config.diff.change_percent_threshold ? 'yes' : 'no'} (${diff.changePercent.toFixed(1)}%)`;
    }
    text += `\nStep ${iteration}/${maxIterations}`;

    content.push({ type: 'text', text });

    this.messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
    });

    this._trimHistory();
    return this._sendRequest();
  }

  /**
   * @returns {Promise<import('@anthropic-ai/sdk').Message>}
   */
  async _sendRequest() {
    const response = await this.client.messages.create({
      model: this.config.claude.model,
      max_tokens: this.config.claude.max_tokens,
      temperature: this.config.claude.temperature,
      system: this.systemPrompt,
      tools: this.tools,
      messages: this.messages,
    });

    this.messages.push({
      role: 'assistant',
      content: response.content,
    });

    return response;
  }

  /** Sliding window history trimming. */
  _trimHistory() {
    const maxMessages = this.historyWindow * 2;
    if (this.messages.length <= maxMessages) return;

    const first = this.messages[0];
    const recent = this.messages.slice(-maxMessages);

    const trimmed = this.messages.slice(1, -maxMessages);
    let summary = '';
    for (const msg of trimmed) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            summary += `- ${block.name}(${JSON.stringify(block.input)})\n`;
          }
        }
      }
    }

    if (summary) {
      this.messages = [
        first,
        { role: 'user', content: [{ type: 'text', text: `[Previous actions]\n${summary}` }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Understood. Continuing.' }] },
        ...recent,
      ];
    } else {
      this.messages = [first, ...recent];
    }
  }

  /**
   * @param {import('@anthropic-ai/sdk').Message} response
   * @returns {Array<{ id: string, name: string, input: Record<string, any> }>}
   */
  static extractToolUses(response) {
    return response.content
      .filter(block => block.type === 'tool_use')
      .map(block => ({ id: block.id, name: block.name, input: block.input }));
  }

  /**
   * @param {import('@anthropic-ai/sdk').Message} response
   * @returns {string}
   */
  static extractText(response) {
    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }
}
