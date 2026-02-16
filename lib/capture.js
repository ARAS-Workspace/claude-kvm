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

import sharp from 'sharp';
import { computeFrameDiff } from './diff.js';

/**
 * Screen Capture module (VNC-based).
 *
 * Takes screenshots via VNC framebuffer and handles stable frame detection.
 * Screenshots are sent to Claude at native resolution.
 */
export class ScreenCapture {
  /**
   * @param {import('./types').ClaudeKVMConfig} config
   * @param {import('./vnc.js').VNCClient} vncClient
   * @param {import('./types').ScaledDisplay} native - Native resolution
   * @param {import('./types').ScaledDisplay} scaled - Scaled resolution for Claude
   */
  constructor(config, vncClient, native, scaled) {
    this.config = config;
    this.vnc = vncClient;
    this.native = native;
    this.scaled = scaled;
    /** @type {Buffer | null} */
    this.previousFrame = null;
  }

  /**
   * Take a screenshot via VNC, compute frame diff, return as PNG base64.
   * @returns {Promise<import('./types').CaptureResult>}
   */
  async captureWithDiff() {
    const { buffer } = await this.vnc.screenshot();

    // Compute diff against previous frame
    let diff = null;
    if (this.config.diff.enabled && this.previousFrame) {
      diff = await computeFrameDiff(
        this.previousFrame,
        buffer,
        this.config.diff.pixel_threshold,
      );
    }

    this.previousFrame = buffer;

    // Scale down for Claude
    const scaledBuffer = await sharp(buffer)
      .resize(this.scaled.width, this.scaled.height)
      .png()
      .toBuffer();
    const base64 = scaledBuffer.toString('base64');

    return { buffer, base64, diff };
  }

  /**
   * Wait for the screen to stabilize after an action.
   * @returns {Promise<import('./types').StableCaptureResult>}
   */
  async captureStableFrame() {
    const {
      screenshot_delay_ms,
      stable_frame_timeout_ms,
      stable_frame_threshold,
    } = this.config.loop;

    // Initial delay after action
    await sleep(screenshot_delay_ms);

    const startTime = Date.now();
    let lastCapture = await this.captureWithDiff();
    let stabilizeMs = Date.now() - startTime;

    if (!this.config.diff.enabled || !lastCapture.diff) {
      return { ...lastCapture, stabilizeMs };
    }

    if (lastCapture.diff.changePercent < stable_frame_threshold) {
      return { ...lastCapture, stabilizeMs };
    }

    // Poll until stable or timeout
    while (Date.now() - startTime < stable_frame_timeout_ms) {
      await sleep(200);
      const newCapture = await this.captureWithDiff();
      stabilizeMs = Date.now() - startTime;

      if (newCapture.diff && newCapture.diff.changePercent < stable_frame_threshold) {
        return { ...newCapture, stabilizeMs };
      }
      lastCapture = newCapture;
    }

    stabilizeMs = Date.now() - startTime;
    return { ...lastCapture, stabilizeMs };
  }

  /**
   * Crop a region around the cursor position from the last screenshot.
   * Returns a small image with a red crosshair overlay showing exact cursor location.
   *
   * @param {number} cx - Cursor X (native)
   * @param {number} cy - Cursor Y (native)
   * @param {number} [radius=150] - Half-size of crop region in native pixels
   * @returns {Promise<string | null>} Base64-encoded PNG of the crop with crosshair, or null if no frame
   */
  async cursorCrop(cx, cy, radius = 150) {
    if (!this.previousFrame) return null;

    const nw = this.native.width;
    const nh = this.native.height;

    // Clamp crop region to screen bounds
    const left = Math.max(0, cx - radius);
    const top = Math.max(0, cy - radius);
    const right = Math.min(nw, cx + radius);
    const bottom = Math.min(nh, cy + radius);
    const cropW = right - left;
    const cropH = bottom - top;

    if (cropW <= 0 || cropH <= 0) return null;

    // Cursor position within the crop
    const crossX = cx - left;
    const crossY = cy - top;

    // Red crosshair SVG overlay
    const crosshairSvg = Buffer.from(`<svg width="${cropW}" height="${cropH}">
      <line x1="${crossX}" y1="0" x2="${crossX}" y2="${cropH}" stroke="red" stroke-width="1" opacity="0.7"/>
      <line x1="0" y1="${crossY}" x2="${cropW}" y2="${crossY}" stroke="red" stroke-width="1" opacity="0.7"/>
      <circle cx="${crossX}" cy="${crossY}" r="5" fill="none" stroke="red" stroke-width="2" opacity="0.9"/>
    </svg>`);

    const cropBuffer = await sharp(this.previousFrame)
      .extract({ left, top, width: cropW, height: cropH })
      .composite([{ input: crosshairSvg, top: 0, left: 0 }])
      .png()
      .toBuffer();

    return cropBuffer.toString('base64');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
