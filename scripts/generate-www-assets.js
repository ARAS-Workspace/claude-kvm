#!/usr/bin/env node

/**
 * generate-www-assets.js
 *
 * Generates all static assets for the www landing page from the master icon SVG.
 * Uses @resvg/resvg-js for SVG → PNG rendering.
 *
 * Usage:
 *   node scripts/generate-www-assets.js
 *
 * Outputs (www/assets/images/):
 *   favicon.svg          — square SVG favicon (static, no animation)
 *   favicon-16x16.png    — 16×16 PNG
 *   favicon-32x32.png    — 32×32 PNG
 *   apple-touch-icon.png — 180×180 PNG
 *   favicon-192x192.png  — 192×192 PNG (Android/PWA)
 *   favicon-512x512.png  — 512×512 PNG (PWA)
 *   og-image.png         — 1200×630 OG image (blue gradient + centered icon)
 */

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MASTER = join(ROOT, "press-kit/masters/claude-kvm-icon-master.svg");
const OUT = join(ROOT, "www/assets/images");

// --- Config ---

const FAVICON_SIZES = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "favicon-192x192.png", size: 192 },
  { name: "favicon-512x512.png", size: 512 },
];

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Master SVG viewBox: 100 240 824 580
const VB = { x: 100, y: 240, w: 824, h: 580 };
const VB_SQ = {
  x: VB.x,
  y: VB.y - (VB.w - VB.h) / 2,
  w: VB.w,
  h: VB.w,
};

// --- SVG builders ---

/** Extracts the inner content between the root <svg> tags. */
function extractSvgInner(svg) {
  const open = svg.indexOf(">", svg.indexOf("<svg")) + 1;
  const close = svg.lastIndexOf("</svg>");
  return svg.substring(open, close);
}

/** Builds a square-cropped SVG for favicon rendering. */
function buildSquareSvg(masterSvg) {
  return masterSvg.replace(
    /viewBox="[^"]*"/,
    `viewBox="${VB_SQ.x} ${VB_SQ.y} ${VB_SQ.w} ${VB_SQ.h}"`
  );
}

/** Builds a static square SVG (no animation) for the SVG favicon. */
function buildStaticFaviconSvg(masterSvg) {
  let svg = buildSquareSvg(masterSvg);
  svg = svg.replace(/@keyframes\s+pulse\s*\{[^}]*\{[^}]*}[^}]*}/g, "");
  svg = svg.replace(/animation:[^;]+;/g, "");
  return svg;
}

/** Builds a 1200×630 OG image SVG with blue gradient background and centered icon. */
function buildOgImageSvg(masterSvg) {
  const inner = extractSvgInner(masterSvg);

  // Scale the icon to fit within the OG canvas with padding
  const iconTargetH = OG_HEIGHT * 0.72;
  const scale = iconTargetH / VB.h;
  const iconRenderedW = VB.w * scale;
  const offsetX = (OG_WIDTH - iconRenderedW) / 2 - VB.x * scale;
  const offsetY = (OG_HEIGHT - iconTargetH) / 2 - VB.y * scale;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" width="${OG_WIDTH}" height="${OG_HEIGHT}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="70%">
      <stop offset="0%" stop-color="#1e3a5f"/>
      <stop offset="60%" stop-color="#152a45"/>
      <stop offset="100%" stop-color="#0c1a2e"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="40%">
      <stop offset="0%" stop-color="rgba(212,132,90,0.10)"/>
      <stop offset="100%" stop-color="rgba(212,132,90,0)"/>
    </radialGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#glow)"/>
  <g transform="translate(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}) scale(${scale.toFixed(6)})">
    ${inner}
  </g>
</svg>`;
}

// --- Rendering ---

/** Renders an SVG string to PNG at the given width. */
function renderPng(svgString, width) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: width },
    background: "rgba(0,0,0,0)",
  });
  return resvg.render().asPng();
}

/** Writes a file and logs the result. */
function writeAsset(name, data) {
  writeFileSync(join(OUT, name), data);
  const kb = typeof data === "string" ? Buffer.byteLength(data) / 1024 : data.length / 1024;
  console.log(`  ${name} (${kb.toFixed(1)}KB)`);
}

// --- Main ---

if (!existsSync(MASTER)) {
  console.error(`Master SVG not found: ${MASTER}`);
  process.exit(1);
}

const masterSvg = readFileSync(MASTER, "utf-8");

// Favicons
console.log("Favicons:");
writeAsset("favicon.svg", buildStaticFaviconSvg(masterSvg));

const squareSvg = buildSquareSvg(masterSvg);
for (const { name, size } of FAVICON_SIZES) {
  writeAsset(name, renderPng(squareSvg, size));
}

// OG image
console.log("\nOG Image:");
const ogSvg = buildOgImageSvg(masterSvg);
writeAsset("og-image.png", renderPng(ogSvg, OG_WIDTH));

console.log("\nDone.");