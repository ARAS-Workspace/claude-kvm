// SPDX-License-Identifier: MIT
import { OPENROUTER_API_KEY, OBSERVER_MODEL } from './config.js';
import { loadPrompt } from './config.js';
import { log } from './log.js';
import { takeScreenshot } from './mcp.js';

const OBSERVER_PROMPT = loadPrompt('observer');
const GROUND_PROMPT = loadPrompt('observer', 'ground_prompt');

/**
 * @param {Array} messages
 * @param {string} systemPrompt
 * @returns {Promise<string|null>}
 */
async function callModel(messages, systemPrompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OBSERVER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 512,
      temperature: 0,
    }),
  });

  if (response.status === 429) {
    log('OBSERVER', `Rate limited (429) on ${OBSERVER_MODEL.split('/').pop()}`);
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    log('OBSERVER', `API error ${response.status}: ${body}`);
    return null;
  }

  /** @type {{ choices: Array<{ message: { content: string } }> }} */
  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Observe the screen and answer a question.
 * @param {string} question
 * @param {object} mcp
 * @returns {Promise<string>}
 */
export async function observe(question, mcp) {
  if (!OPENROUTER_API_KEY) {
    return 'Error: OPENROUTER_API_KEY not set — observer unavailable.';
  }

  const screenshot = await takeScreenshot(mcp);
  const prompt = OBSERVER_PROMPT.replace('{question}', question);

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}` } },
        { type: 'text', text: question },
      ],
    },
  ];

  const response = await callModel(messages, prompt);

  if (response === null) {
    return 'Observer unavailable (API error or rate limit). Use screenshot instead.';
  }

  return response;
}

/**
 * Get exact pixel coordinates of a UI element from the observer.
 * @param {string} description - What element to find
 * @param {object} mcp
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @returns {Promise<string>} Coordinates as "x,y" or error message
 */
export async function ground(description, mcp, screenWidth, screenHeight) {
  if (!OPENROUTER_API_KEY) {
    return 'Error: OPENROUTER_API_KEY not set — grounding unavailable.';
  }

  const screenshot = await takeScreenshot(mcp);

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}` } },
        { type: 'text', text: `Screen: ${screenWidth}×${screenHeight}. Find the center of: "${description}"` },
      ],
    },
  ];

  const response = await callModel(messages, GROUND_PROMPT);

  if (response === null) {
    return 'Grounding unavailable (API error or rate limit).';
  }

  return response.trim();
}
