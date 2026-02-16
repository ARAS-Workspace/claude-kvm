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
 * Character / Key Name → X11 Keysym mapping.
 *
 * VNC uses X11 keysyms for keyboard input.
 * ASCII printable chars (0x20-0x7E) map directly to their code point.
 * Special keys use the 0xFF** range.
 *
 * Reference: https://www.x.org/releases/current/doc/xproto/x11protocol.html#keysym_encoding
 */

// Special key keysyms
const SPECIAL_KEYSYMS = {
  backspace:    0xFF08,
  tab:          0xFF09,
  return:       0xFF0D,
  enter:        0xFF0D,
  ret:          0xFF0D,
  escape:       0xFF1B,
  esc:          0xFF1B,
  delete:       0xFFFF,
  del:          0xFFFF,

  // Cursor control
  home:         0xFF50,
  left:         0xFF51,
  up:           0xFF52,
  right:        0xFF53,
  down:         0xFF54,
  pageup:       0xFF55,
  pgup:         0xFF55,
  pagedown:     0xFF56,
  pgdn:         0xFF56,
  end:          0xFF57,
  insert:       0xFF63,

  // Function keys
  f1:           0xFFBE,
  f2:           0xFFBF,
  f3:           0xFFC0,
  f4:           0xFFC1,
  f5:           0xFFC2,
  f6:           0xFFC3,
  f7:           0xFFC4,
  f8:           0xFFC5,
  f9:           0xFFC6,
  f10:          0xFFC7,
  f11:          0xFFC8,
  f12:          0xFFC9,

  // Modifiers
  shift:        0xFFE1,
  shift_l:      0xFFE1,
  shift_r:      0xFFE2,
  ctrl:         0xFFE3,
  ctrl_l:       0xFFE3,
  ctrl_r:       0xFFE4,
  control:      0xFFE3,
  alt:          0xFFE9,
  alt_l:        0xFFE9,
  alt_r:        0xFFEA,
  option:       0xFFE9,
  opt:          0xFFE9,
  meta:         0xFFE7,
  meta_l:       0xFFE7,
  meta_r:       0xFFE8,
  cmd:          0xFFE7,
  command:      0xFFE7,
  super:        0xFFE7,
  super_l:      0xFFE7,
  super_r:      0xFFE8,

  // Misc
  space:        0x0020,
  spc:          0x0020,
  capslock:     0xFFE5,
  numlock:      0xFF7F,
  scrolllock:   0xFF14,
  printscreen:  0xFF61,
  print:        0xFF61,
  pause:        0xFF13,
  menu:         0xFF67,
};

// Characters that require Shift on a US keyboard layout
const SHIFT_CHARS = new Set('~!@#$%^&*()_+{}|:"<>?ABCDEFGHIJKLMNOPQRSTUVWXYZ');

/**
 * Convert a printable character to its X11 keysym.
 * For ASCII chars, the keysym equals the Unicode code point.
 * @param {string} ch - Single character
 * @returns {import('../lib/types').KeysymMapping | null}
 */
export function charToKeysym(ch) {
  const code = ch.charCodeAt(0);

  // Standard ASCII printable range (space through ~)
  if (code >= 0x20 && code <= 0x7E) {
    const shift = SHIFT_CHARS.has(ch);

    // For uppercase letters, the keysym is the lowercase version
    // but we send it with shift held down
    if (ch >= 'A' && ch <= 'Z') {
      return { keysym: ch.toLowerCase().charCodeAt(0), shift: true };
    }

    // For shifted symbols, the keysym is the character itself
    // VNC expects the keysym of the actual character, with shift modifier
    if (shift) {
      return { keysym: code, shift: true };
    }

    return { keysym: code, shift: false };
  }

  // Latin-1 supplement (0x80-0xFF) — keysym equals code point
  if (code >= 0xA0 && code <= 0xFF) {
    return { keysym: code, shift: false };
  }

  return null;
}

/**
 * Resolve a named key to its X11 keysym.
 * @param {string} name - Key name (e.g. "enter", "cmd", "f5")
 * @returns {number | null}
 */
export function namedKeyToKeysym(name) {
  return SPECIAL_KEYSYMS[name.toLowerCase()] ?? null;
}

export { SPECIAL_KEYSYMS };
