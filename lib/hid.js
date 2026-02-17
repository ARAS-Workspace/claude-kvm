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

import { charToKeysym, namedKeyToKeysym } from '../utils/keysym.js';

/**
 * HID Controller — KVM-style input via VNC.
 *
 * Tracks cursor position. Uses direct teleport for move.
 * Smooth interpolation only for drag operations.
 * Click operations use the current tracked position.
 */

// VNC button masks
const BUTTON = {
  LEFT: 1,
  MIDDLE: 2,
  RIGHT: 4,
  SCROLL_UP: 8,
  SCROLL_DOWN: 16,
  SCROLL_LEFT: 32,
  SCROLL_RIGHT: 64,
};

export class HIDController {
  /**
   * @param {import('./types.js').ClaudeKVMConfig} config
   * @param {import('./vnc.js').VNCClient} vncClient
   */
  constructor(config, vncClient) {
    this.vnc = vncClient;
    this.clickHoldMs = config.hid.click_hold_ms;
    this.keyHoldMs = config.hid.key_hold_ms;
    this.typingDelay = config.hid.typing_delay_ms;
    this.scrollEventsPerStep = config.hid.scroll_events_per_step ?? 5;

    /** @type {number} Current cursor X (native resolution) */
    this.cursorX = 0;
    /** @type {number} Current cursor Y (native resolution) */
    this.cursorY = 0;
  }

  // ── Cursor Position ──────────────────────────────────────

  /**
   * Get current cursor position in native coordinates.
   * @returns {import('./types.js').CursorPosition}
   */
  getCursorPosition() {
    return { x: this.cursorX, y: this.cursorY };
  }

  // ── Mouse: Move ──────────────────────────────────────────

  /**
   * Teleport cursor to target position (single pointer event).
   * @param {number} x - Target X (native resolution)
   * @param {number} y - Target Y (native resolution)
   */
  async mouseMove(x, y) {
    this.vnc.pointerEvent(x, y, 0);
    this.cursorX = x;
    this.cursorY = y;
  }

  // ── Mouse: Click (at current position) ───────────────────

  /**
   * Click at current cursor position.
   * @param {'left' | 'middle' | 'right'} [button='left']
   */
  async mouseClick(button = 'left') {
    const mask = button === 'right' ? BUTTON.RIGHT :
                 button === 'middle' ? BUTTON.MIDDLE : BUTTON.LEFT;

    this.vnc.pointerEvent(this.cursorX, this.cursorY, mask);
    await sleep(this.clickHoldMs);
    this.vnc.pointerEvent(this.cursorX, this.cursorY, 0);
  }

  /** Double-click at current cursor position. */
  async mouseDoubleClick() {
    await this.mouseClick('left');
    await sleep(50);
    await this.mouseClick('left');
  }

  // ── Mouse: Drag ──────────────────────────────────────────

  /**
   * Drag from current position to target (smooth).
   * @param {number} endX - Target X (native resolution)
   * @param {number} endY - Target Y (native resolution)
   */
  async mouseDrag(endX, endY) {
    // Press at current position
    this.vnc.pointerEvent(this.cursorX, this.cursorY, BUTTON.LEFT);
    await sleep(100);

    // Smooth drag to target
    const steps = Math.max(5, Math.ceil(
      Math.hypot(endX - this.cursorX, endY - this.cursorY) / 30
    ));
    const startX = this.cursorX;
    const startY = this.cursorY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ix = Math.round(startX + (endX - startX) * t);
      const iy = Math.round(startY + (endY - startY) * t);
      this.vnc.pointerEvent(ix, iy, BUTTON.LEFT);
      await sleep(12);
    }

    // Release
    this.vnc.pointerEvent(endX, endY, 0);
    this.cursorX = endX;
    this.cursorY = endY;
  }

  // ── Mouse: Scroll ────────────────────────────────────────

  /**
   * Scroll at current cursor position.
   * @param {'up' | 'down' | 'left' | 'right'} direction
   * @param {number} [amount=3]
   */
  async scroll(direction, amount = 3) {
    const buttonMask = direction === 'up' ? BUTTON.SCROLL_UP :
                       direction === 'down' ? BUTTON.SCROLL_DOWN :
                       direction === 'left' ? BUTTON.SCROLL_LEFT :
                       BUTTON.SCROLL_RIGHT;

    for (let i = 0; i < amount; i++) {
      for (let j = 0; j < this.scrollEventsPerStep; j++) {
        this.vnc.pointerEvent(this.cursorX, this.cursorY, buttonMask);
        await sleep(10);
        this.vnc.pointerEvent(this.cursorX, this.cursorY, 0);
        await sleep(10);
      }
      await sleep(30);
    }
  }

  // ── Keyboard ─────────────────────────────────────────────

  /** @param {string} key */
  async keyPress(key) {
    const keysym = namedKeyToKeysym(key);
    if (!keysym) {
      console.warn(`HID: unknown key "${key}"`);
      return;
    }
    this.vnc.keyEvent(keysym, true);
    await sleep(this.keyHoldMs);
    this.vnc.keyEvent(keysym, false);
  }

  /** @param {string} combo - Keys separated by '+' */
  async keyCombo(combo) {
    const keys = combo.split('+').map(k => k.trim().toLowerCase());
    /** @type {number[]} */
    const keysyms = [];

    for (const k of keys) {
      const ks = namedKeyToKeysym(k);
      if (ks) {
        keysyms.push(ks);
      } else {
        const charKs = charToKeysym(k);
        if (charKs) keysyms.push(charKs.keysym);
        else { console.warn(`HID: unknown key in combo "${k}"`); return; }
      }
    }

    for (const ks of keysyms) {
      this.vnc.keyEvent(ks, true);
      await sleep(50);
    }
    await sleep(80);
    for (let i = keysyms.length - 1; i >= 0; i--) {
      this.vnc.keyEvent(keysyms[i], false);
      await sleep(50);
    }
  }

  /** @param {string} text */
  async typeText(text) {
    for (const ch of text) {
      const mapping = charToKeysym(ch);
      if (!mapping) {
        console.warn(`HID: unmapped char '${ch}' (${ch.charCodeAt(0)})`);
        continue;
      }

      const { keysym, shift } = mapping;
      const delay = this.typingDelay.min +
        Math.random() * (this.typingDelay.max - this.typingDelay.min);

      if (shift) {
        this.vnc.keyEvent(0xFFE1, true);
        await sleep(20);
      }

      this.vnc.keyEvent(keysym, true);
      await sleep(this.keyHoldMs);
      this.vnc.keyEvent(keysym, false);

      if (shift) {
        await sleep(20);
        this.vnc.keyEvent(0xFFE1, false);
      }

      await sleep(delay);
    }
  }

  /**
   * Paste text via clipboard, or typeText fallback on macOS.
   * Apple VNC doesn't bridge ClientCutText to the system pasteboard.
   * @param {string} text
   */
  async pasteText(text) {
    if (this.vnc.isMacOS) {
      await this.typeText(text);
      return;
    }
    this.vnc.setClipboard(text);
    await sleep(100);
    await this.keyCombo('ctrl+v');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
