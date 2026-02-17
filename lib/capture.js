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

/**
 * Screen Capture module (VNC-based).
 *
 * Provides atomic screen instruments — each method does one thing.
 * The orchestration of when to capture, diff, or crop is left to the caller.
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
    /** @type {Buffer | null} Raw RGBA baseline for diff */
    this.baselineRaw = null;
    /** @type {number | null} Last screenshot duration in ms */
    this.lastScreenshotMs = null;
  }

  /**
   * Capture the full screen, scale for Claude, return as base64 PNG.
   * @returns {Promise<string>} Base64-encoded PNG
   */
  async captureScreenshot() {
    const t0 = performance.now();
    const { buffer } = await this.vnc.screenshot();
    const scaledBuffer = await sharp(buffer)
      .resize(this.scaled.width, this.scaled.height)
      .png()
      .toBuffer();
    this.lastScreenshotMs = Math.round(performance.now() - t0);
    return scaledBuffer.toString('base64');
  }

  /**
   * Save current screen as the diff baseline (raw RGBA, no PNG encode).
   */
  async setBaseline() {
    await this.vnc.waitForFrame(false, 2000);
    this.baselineRaw = this.vnc.getFramebufferCopy();
  }

  /**
   * Compare current screen against baseline.
   * Requests a fresh frame, compares raw RGBA, updates baseline.
   * @returns {Promise<import('./types').QuickDiffResult>}
   */
  async quickDiffCheck() {
    await this.vnc.waitForFrame(false, 2000);

    if (!this.baselineRaw) {
      this.baselineRaw = this.vnc.getFramebufferCopy();
      return { changeDetected: false };
    }

    const changeDetected = this._rawDiff(this.baselineRaw);

    this.baselineRaw = this.vnc.getFramebufferCopy();
    return { changeDetected };
  }

  /**
   * Crop a region around the cursor position.
   * Captures a fresh frame from VNC.
   *
   * @param {number} cx - Cursor X (native)
   * @param {number} cy - Cursor Y (native)
   * @param {number} [radius=150] - Half-size of crop region in native pixels
   * @returns {Promise<string | null>} Base64-encoded PNG of the crop, or null
   */
  async cursorCrop(cx, cy, radius = 150) {
    const { buffer } = await this.vnc.screenshot();

    const nw = this.native.width;
    const nh = this.native.height;

    const left = Math.max(0, cx - radius);
    const top = Math.max(0, cy - radius);
    const right = Math.min(nw, cx + radius);
    const bottom = Math.min(nh, cy + radius);
    const cropW = right - left;
    const cropH = bottom - top;

    if (cropW <= 0 || cropH <= 0) return null;

    // Extract crop as raw RGBA so we can draw the crosshair
    const rawCrop = await sharp(buffer)
      .extract({ left, top, width: cropW, height: cropH })
      .raw()
      .toBuffer();

    // Draw crosshair at cursor position within the crop
    const relX = cx - left;
    const relY = cy - top;
    this._drawCrosshair(rawCrop, cropW, cropH, relX, relY);

    const pngBuffer = await sharp(rawCrop, {
      raw: { width: cropW, height: cropH, channels: 4 },
    }).png().toBuffer();

    return pngBuffer.toString('base64');
  }

  /**
   * Crop an arbitrary rectangular region from the framebuffer.
   * Coordinates are in native (VNC) resolution.
   *
   * @param {number} x - Left edge (native pixels)
   * @param {number} y - Top edge (native pixels)
   * @param {number} cropWidth - Width (native pixels)
   * @param {number} cropHeight - Height (native pixels)
   * @returns {Promise<Buffer>} PNG buffer of the cropped region
   */
  async cropRegion(x, y, cropWidth, cropHeight) {
    const { buffer } = await this.vnc.screenshot();

    const left = Math.max(0, Math.min(x, this.native.width - 1));
    const top = Math.max(0, Math.min(y, this.native.height - 1));
    const w = Math.min(cropWidth, this.native.width - left);
    const h = Math.min(cropHeight, this.native.height - top);

    if (w <= 0 || h <= 0) {
      throw new Error(`Invalid crop region: ${w}x${h} at (${left},${top})`);
    }

    return sharp(buffer)
      .extract({ left, top, width: w, height: h })
      .png()
      .toBuffer();
  }

  /**
   * Draw a red crosshair on a raw RGBA buffer.
   * @param {Buffer} buf - Raw RGBA pixel buffer
   * @param {number} w - Image width
   * @param {number} h - Image height
   * @param {number} cx - Crosshair center X
   * @param {number} cy - Crosshair center Y
   * @private
   */
  _drawCrosshair(buf, w, h, cx, cy) {
    const size = 12;
    const r = 255, g = 0, b = 0, a = 255;

    for (let i = -size; i <= size; i++) {
      // Horizontal line
      const hx = cx + i;
      if (hx >= 0 && hx < w && cy >= 0 && cy < h) {
        const off = (cy * w + hx) * 4;
        buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = a;
      }
      // Vertical line
      const vy = cy + i;
      if (cx >= 0 && cx < w && vy >= 0 && vy < h) {
        const off = (vy * w + cx) * 4;
        buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = a;
      }
    }
  }

  /**
   * Raw RGBA pixel diff against current framebuffer.
   * Returns true on the first changed pixel — maximum sensitivity.
   * @param {Buffer} baseline - Raw RGBA buffer
   * @returns {boolean} Whether any pixel changed
   * @private
   */
  _rawDiff(baseline) {
    const fb = this.vnc.framebuffer;
    const threshold = this.config.diff.pixel_threshold;

    for (let i = 0; i < baseline.length; i += 4) {
      if (Math.abs(baseline[i] - fb[i]) > threshold ||
          Math.abs(baseline[i + 1] - fb[i + 1]) > threshold ||
          Math.abs(baseline[i + 2] - fb[i + 2]) > threshold) {
        return true;
      }
    }

    return false;
  }
}