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
 * Frame Diff Engine.
 *
 * Compares two PNG buffers pixel-by-pixel and returns the change percentage.
 */

/**
 * Compare two screenshots and return the percentage of changed pixels.
 * @param {Buffer} bufferA - Previous frame (PNG)
 * @param {Buffer} bufferB - Current frame (PNG)
 * @param {number} [pixelThreshold=30] - Per-channel difference threshold (0-255)
 * @returns {Promise<import('./types').FrameDiffResult>}
 */
export async function computeFrameDiff(bufferA, bufferB, pixelThreshold = 30) {
  // Decode both images to raw RGBA pixel data
  const [imgA, imgB] = await Promise.all([
    sharp(bufferA).raw().ensureAlpha().toBuffer({ resolveWithObject: true }),
    sharp(bufferB).raw().ensureAlpha().toBuffer({ resolveWithObject: true }),
  ]);

  const dataA = imgA.data;
  const dataB = imgB.data;

  // If dimensions differ, treat as 100% changed
  if (imgA.info.width !== imgB.info.width || imgA.info.height !== imgB.info.height) {
    return { changePercent: 100, totalPixels: 0, changedPixels: 0 };
  }

  const totalPixels = imgA.info.width * imgA.info.height;
  let changedPixels = 0;

  // Compare pixel by pixel (4 bytes per pixel: R, G, B, A)
  for (let i = 0; i < dataA.length; i += 4) {
    const dr = Math.abs(dataA[i] - dataB[i]);
    const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const db = Math.abs(dataA[i + 2] - dataB[i + 2]);

    // A pixel is "changed" if any channel differs by more than threshold
    if (dr > pixelThreshold || dg > pixelThreshold || db > pixelThreshold) {
      changedPixels++;
    }
  }

  const changePercent = (changedPixels / totalPixels) * 100;

  return { changePercent, totalPixels, changedPixels };
}
