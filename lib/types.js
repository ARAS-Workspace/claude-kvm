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
 * @typedef {object} VNCConnectionConfig
 * @property {string} host
 * @property {number} port
 * @property {'auto' | 'none'} auth
 * @property {string} [username]
 * @property {string} [password]
 */

/**
 * @typedef {object} TypingDelayConfig
 * @property {number} min
 * @property {number} max
 */

/**
 * @typedef {object} HIDConfig
 * @property {number} click_hold_ms
 * @property {number} key_hold_ms
 * @property {TypingDelayConfig} typing_delay_ms
 * @property {number} scroll_events_per_step
 */

/**
 * @typedef {object} CaptureConfig
 */

/**
 * @typedef {object} DiffConfig
 * @property {number} pixel_threshold
 */

/**
 * @typedef {object} DisplayConfig
 * @property {number} max_dimension
 */

/**
 * @typedef {object} VNCTimeoutConfig
 * @property {number} connect_timeout_ms
 * @property {number} screenshot_timeout_ms
 */

/**
 * @typedef {object} ClaudeKVMConfig
 * @property {DisplayConfig} [display]
 * @property {HIDConfig} hid
 * @property {CaptureConfig} capture
 * @property {DiffConfig} diff
 * @property {VNCTimeoutConfig} [vnc_timeouts]
 */

/**
 * @typedef {object} PixelFormat
 * @property {number} bitsPerPixel
 * @property {number} depth
 * @property {number} bigEndian
 * @property {number} trueColour
 * @property {number} redMax
 * @property {number} greenMax
 * @property {number} blueMax
 * @property {number} redShift
 * @property {number} greenShift
 * @property {number} blueShift
 */

/**
 * @typedef {object} VNCServerInfo
 * @property {number} width
 * @property {number} height
 * @property {string} name
 */

/**
 * @typedef {object} ScreenshotResult
 * @property {Buffer} buffer
 * @property {string} base64
 * @property {number} width
 * @property {number} height
 */


/**
 * @typedef {object} QuickDiffResult
 * @property {boolean} changeDetected
 */

/**
 * @typedef {object} ScaledDisplay
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} ToolExecResult
 * @property {string} text
 * @property {string} [imageBase64]
 * @property {boolean} [done]
 * @property {'success' | 'failed'} [status]
 */

/**
 * @typedef {object} KeysymMapping
 * @property {number} keysym
 * @property {boolean} shift
 */

/**
 * @typedef {object} CursorPosition
 * @property {number} x
 * @property {number} y
 */

export {};
