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

import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';

/**
 * Lightweight VNC/RFB client.
 *
 * Implements the RFB (Remote Framebuffer) protocol:
 * - Connects to any VNC server
 * - Receives framebuffer updates (screenshots)
 * - Sends PointerEvent (mouse) and KeyEvent (keyboard)
 *
 * Reference: RFC 6143 — The Remote Framebuffer Protocol
 */

// RFB message types (server → client)
const S2C = {
  FRAMEBUFFER_UPDATE: 0,
  SET_COLOUR_MAP: 1,
  BELL: 2,
  SERVER_CUT_TEXT: 3,
};

// RFB message types (client → server)
const C2S = {
  SET_PIXEL_FORMAT: 0,
  SET_ENCODINGS: 2,
  FRAMEBUFFER_UPDATE_REQUEST: 3,
  KEY_EVENT: 4,
  POINTER_EVENT: 5,
  CLIENT_CUT_TEXT: 6,
};

// RFB encodings
const ENCODING = {
  RAW: 0,
  COPY_RECT: 1,
  ZRLE: 16,
  CURSOR: -239,
  DESKTOP_SIZE: -223,
};

// RFB security types
const SECURITY = {
  NONE: 1,
  VNC_AUTH: 2,
  VENCRYPT: 19,
  ARD: 30,
};

// VeNCrypt sub-types
const VENCRYPT_SUB = {
  PLAIN: 256,
  TLS_NONE: 257,
  TLS_VNC: 258,
  TLS_PLAIN: 259,
  X509_NONE: 260,
  X509_VNC: 261,
  X509_PLAIN: 262,
};

const VENCRYPT_SUB_NAMES = {
  256: 'Plain',
  257: 'TLSNone',
  258: 'TLSVNC',
  259: 'TLSPlain',
  260: 'X509None',
  261: 'X509VNC',
  262: 'X509Plain',
};

// Security type names for debug
const SECURITY_NAMES = {
  1: 'None',
  2: 'VNC Authentication',
  5: 'RA2 (RealVNC)',
  6: 'RA2ne (RealVNC)',
  16: 'Tight',
  18: 'TLS',
  19: 'VeNCrypt',
  30: 'Apple Remote Desktop',
};

function dbg(label, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[VNC ${ts}] ${label}`, ...args);
}

// ── BigInt DH helpers (ARD auth) ────────────────────────────

/**
 * Convert Buffer (big-endian) to BigInt.
 * @param {Buffer | Uint8Array} buf
 * @returns {bigint}
 */
function bufToBigInt(buf) {
  return BigInt('0x' + Buffer.from(buf).toString('hex'));
}

/**
 * Convert BigInt to Buffer (big-endian, zero-padded to len bytes).
 * @param {bigint} n
 * @param {number} len
 * @returns {Buffer}
 */
function bigIntToBuf(n, len) {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length >= len) return buf.subarray(buf.length - len);
  const padded = Buffer.alloc(len, 0);
  buf.copy(padded, len - buf.length);
  return padded;
}

/**
 * Modular exponentiation: base^exp mod m.
 * @param {bigint} base
 * @param {bigint} exp
 * @param {bigint} m
 * @returns {bigint}
 */
function modpow(base, exp, m) {
  let result = 1n;
  base = base % m;
  while (exp > 0n) {
    if (exp % 2n === 1n) result = (result * base) % m;
    exp = exp / 2n;
    base = (base * base) % m;
  }
  return result;
}

/**
 * Auth registry — maps auth name to RFB protocol details.
 * Priority order: vencrypt > vnc > ard > none (used for auto-negotiate).
 */
const AUTH_REGISTRY = {
  vencrypt: { rfbType: SECURITY.VENCRYPT,  state: 'vencrypt-version',   bytes: 2  },
  vnc:      { rfbType: SECURITY.VNC_AUTH,  state: 'vnc-auth-challenge', bytes: 16 },
  ard:      { rfbType: SECURITY.ARD,       state: 'ard-auth',           bytes: 4  },
  none:     { rfbType: SECURITY.NONE,      state: 'security-result',    bytes: 4  },
};

/** Priority-ordered list of auth names for auto-negotiation. */
const AUTH_PRIORITY = Object.keys(AUTH_REGISTRY);

export class VNCClient extends EventEmitter {
  /**
   * @param {import('./types').VNCConnectionConfig} vncConfig
   */
  constructor(vncConfig) {
    super();
    this.host = vncConfig.host;
    this.port = vncConfig.port;
    this.authType = vncConfig.auth || 'none';
    this.username = vncConfig.username || '';
    this.password = vncConfig.password || '';

    /** @type {import('node:net').Socket | import('node:tls').TLSSocket | null} */
    this.socket = null;
    this.connected = false;
    this.ready = false;

    // Server info (filled after handshake)
    this.width = 0;
    this.height = 0;
    this.serverName = '';
    /** @type {boolean} */
    this.isMacOS = false;
    /** @type {import('./types').PixelFormat | null} */
    this.pixelFormat = null;

    // Framebuffer
    /** @type {Buffer | null} */
    this.framebuffer = null;
    // noinspection JSUnusedGlobalSymbols
    /** @type {boolean} */
    this.framebufferDirty = false;
    /** @type {ReturnType<typeof setInterval> | null} */
    this._syncInterval = null;

    // Internal state
    /** @type {Buffer} */
    this._buffer = Buffer.alloc(0);
    /** @type {string} */
    this._state = 'version';
    /** @type {number} */
    this._expectedBytes = 12;
    /** @type {{ resolve: Function, reject: Function, timer: ReturnType<typeof setTimeout> } | null} */
    this._pendingScreenshot = null;
    /** @type {number} */
    this._vencryptSubType = 0;

    dbg('INIT', `target=${this.host}:${this.port} auth=${this.authType} user="${this.username}"`);
  }

  /**
   * Connect to the VNC server.
   * @returns {Promise<import('./types').VNCServerInfo>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      dbg('CONNECT', `opening TCP to ${this.host}:${this.port}...`);
      this.socket = net.connect(this.port, this.host);

      this.socket.on('connect', () => {
        this.connected = true;
        dbg('TCP', 'connection established');
      });

      this.socket.on('data', (data) => {
        this._onData(data);
      });

      this.socket.on('error', (err) => {
        dbg('ERROR', err.message);
        if (!this.ready) {
          reject(new Error(`VNC connection failed: ${err.message}`));
        } else {
          this.emit('error', err);
        }
      });

      this.socket.on('close', () => {
        dbg('CLOSE', 'socket closed');
        this.connected = false;
        this.ready = false;
        this.emit('close');
      });

      this.once('ready', (info) => resolve(info));
      this.once('handshake-error', (err) => reject(err));
    });
  }

  // ── Data Handling ──────────────────────────────────────────

  _onData(data) {
    this._buffer = Buffer.concat([this._buffer, data]);

    // Only log during handshake, not during framebuffer transfers
    if (this._state !== 'message') {
      dbg('DATA', `+${data.length}B → buf=${this._buffer.length}/${this._expectedBytes} state=${this._state}`);
    }

    this._processBuffer();
  }

  // ── RFB Protocol State Machine ────────────────────────────

  _processBuffer() {
    while (this._buffer.length >= this._expectedBytes) {
      if (this._state !== 'message') {
        dbg('FSM', `state=${this._state}, buf=${this._buffer.length}, need=${this._expectedBytes}`);
      }
      switch (this._state) {
        case 'version':
          this._handleVersion();
          break;
        case 'security-types':
          this._handleSecurityTypes();
          break;
        case 'security-types-list':
          this._handleSecurityTypes();
          break;
        case 'vnc-auth-challenge':
          this._handleVNCAuthChallenge();
          break;
        case 'ard-auth':
          this._handleARDAuth();
          break;
        case 'vencrypt-version':
          this._handleVeNCryptVersion();
          break;
        case 'vencrypt-version-ack':
          this._handleVeNCryptVersionAck();
          break;
        case 'vencrypt-subtypes':
          this._handleVeNCryptSubtypes();
          break;
        case 'vencrypt-subtypes-list':
          this._handleVeNCryptSubtypes();
          break;
        case 'vencrypt-subtype-ack':
          this._handleVeNCryptSubtypeAck();
          break;
        case 'vencrypt-tls':
          // TLS upgrade in progress — handled async, do nothing here
          break;
        case 'vencrypt-plain-result':
          this._handleSecurityResult();
          break;
        case 'security-result':
          this._handleSecurityResult();
          break;
        case 'security-result-reason':
          this._handleSecurityResultReason();
          break;
        case 'server-init':
          this._handleServerInit();
          break;
        case 'message':
          this._handleServerMessage();
          break;
        default:
          dbg('FSM', `unknown state: ${this._state}`);
          return;
      }
    }
  }

  /**
   * @param {number} n
   * @returns {Buffer}
   */
  _consume(n) {
    const data = this._buffer.subarray(0, n);
    this._buffer = this._buffer.subarray(n);
    return data;
  }

  _handleVersion() {
    const versionStr = this._consume(12).toString('ascii').trim();
    dbg('VERSION', `server version: "${versionStr}"`);

    // Detect macOS: Apple VNC uses non-standard RFB version 003.889
    this.isMacOS = versionStr.includes('003.889');
    if (this.isMacOS) dbg('VERSION', 'detected macOS (Apple VNC)');

    // Send our version — we speak 003.008
    const ourVersion = 'RFB 003.008\n';
    dbg('VERSION', `sending our version: "RFB 003.008"`);
    this.socket.write(ourVersion);

    this._state = 'security-types';
    this._expectedBytes = 1;
  }

  _handleSecurityTypes() {
    if (this._state === 'security-types') {
      const numTypes = this._buffer.readUInt8(0);
      this._consume(1);
      dbg('SECURITY', `server offers ${numTypes} security type(s)`);

      if (numTypes === 0) {
        dbg('SECURITY', 'server sent 0 types — reading error reason...');
        this._state = 'security-error-length';
        this._expectedBytes = 4;
        return;
      }

      this._expectedBytes = numTypes;
      this._state = 'security-types-list';
      return;
    }

    if (this._state === 'security-types-list') {
      const types = this._consume(this._expectedBytes);
      const typeList = [];
      for (let i = 0; i < types.length; i++) {
        typeList.push(types.readUInt8(i));
      }

      dbg('SECURITY', `available types: [${typeList.join(', ')}]`);
      for (const t of typeList) {
        dbg('SECURITY', `  type ${t} = ${SECURITY_NAMES[t] || 'UNKNOWN'}`);
      }

      // Select auth: "none" forces no-auth, "auto" negotiates best available
      let selectedName;
      let entry;

      if (this.authType === 'none') {
        if (!typeList.includes(SECURITY.NONE)) {
          const offered = typeList.map(t => `${t}(${SECURITY_NAMES[t] || '?'})`).join(', ');
          this.emit('handshake-error', new Error(`Server requires auth but VNC_AUTH=none. Offered: [${offered}]`));
          return;
        }
        selectedName = 'none';
        entry = AUTH_REGISTRY.none;
      } else {
        selectedName = AUTH_PRIORITY.find(name => typeList.includes(AUTH_REGISTRY[name].rfbType));
        if (!selectedName) {
          const offered = typeList.map(t => `${t}(${SECURITY_NAMES[t] || '?'})`).join(', ');
          this.emit('handshake-error', new Error(`No supported auth in [${offered}]`));
          return;
        }
        entry = AUTH_REGISTRY[selectedName];
      }

      dbg('SECURITY', `selecting "${selectedName}" → RFB type ${entry.rfbType} (${SECURITY_NAMES[entry.rfbType]})`);

      const buf = Buffer.alloc(1);
      buf.writeUInt8(entry.rfbType, 0);
      this.socket.write(buf);

      this._state = entry.state;
      this._expectedBytes = entry.bytes;
    }
  }

  // ── VeNCrypt Authentication (type 19) ──────────────────────

  /**
   * VeNCrypt protocol flow:
   * 1. Server sends version: major(1) + minor(1)  → expect "0.2"
   * 2. Client sends version: "0.2"
   * 3. Server sends ack: 0 = OK, 255 = fail
   * 4. Server sends sub-type count(1) + sub-types(4 bytes each)
   * 5. Client picks a sub-type and sends it (4 bytes)
   * 6. If TLS sub-type: upgrade socket to TLS
   * 7. Perform inner auth (Plain, VNC, None)
   * 8. Receive security result
   */
  _handleVeNCryptVersion() {
    if (this._buffer.length < 2) { this._expectedBytes = 2; return; }
    const major = this._buffer.readUInt8(0);
    const minor = this._buffer.readUInt8(1);
    this._consume(2);
    dbg('VENCRYPT', `server version: ${major}.${minor}`);

    // Send our version (0.2)
    const buf = Buffer.alloc(2);
    buf.writeUInt8(0, 0);
    buf.writeUInt8(2, 1);
    this.socket.write(buf);
    dbg('VENCRYPT', 'sent client version: 0.2');

    this._state = 'vencrypt-version-ack';
    this._expectedBytes = 1;
  }

  _handleVeNCryptVersionAck() {
    const ack = this._buffer.readUInt8(0);
    this._consume(1);
    dbg('VENCRYPT', `version ack: ${ack} (${ack === 0 ? 'OK' : 'FAIL'})`);

    if (ack !== 0) {
      this.emit('handshake-error', new Error('VeNCrypt version negotiation failed'));
      return;
    }

    this._state = 'vencrypt-subtypes';
    this._expectedBytes = 1; // sub-type count
  }

  _handleVeNCryptSubtypes() {
    if (this._state === 'vencrypt-subtypes') {
      const count = this._buffer.readUInt8(0);
      this._consume(1);
      dbg('VENCRYPT', `${count} sub-type(s) available`);

      if (count === 0) {
        this.emit('handshake-error', new Error('VeNCrypt: server offers 0 sub-types'));
        return;
      }

      this._expectedBytes = count * 4;
      this._state = 'vencrypt-subtypes-list';
      return;
    }

    if (this._state === 'vencrypt-subtypes-list') {
      const count = this._expectedBytes / 4;
      const subTypes = [];
      for (let i = 0; i < count; i++) {
        subTypes.push(this._buffer.readUInt32BE(i * 4));
      }
      this._consume(count * 4);

      dbg('VENCRYPT', `sub-types: [${subTypes.join(', ')}]`);
      for (const st of subTypes) {
        dbg('VENCRYPT', `  ${st} = ${VENCRYPT_SUB_NAMES[st] || 'UNKNOWN'}`);
      }

      // Priority: TLSPlain (259) > TLSNone (257) > TLSVNC (258) > Plain (256)
      // TLSPlain allows username+password over TLS — ideal for Raspberry Pi
      let chosen = null;
      const priority = [
        VENCRYPT_SUB.TLS_PLAIN,
        VENCRYPT_SUB.TLS_VNC,
        VENCRYPT_SUB.TLS_NONE,
        VENCRYPT_SUB.X509_PLAIN,
        VENCRYPT_SUB.X509_VNC,
        VENCRYPT_SUB.X509_NONE,
        VENCRYPT_SUB.PLAIN,
      ];

      for (const p of priority) {
        if (subTypes.includes(p)) {
          chosen = p;
          break;
        }
      }

      if (!chosen) {
        const msg = `VeNCrypt: no supported sub-type. Server offers: [${subTypes.map(s => `${s}(${VENCRYPT_SUB_NAMES[s] || '?'})`).join(', ')}]`;
        dbg('VENCRYPT', msg);
        this.emit('handshake-error', new Error(msg));
        return;
      }

      dbg('VENCRYPT', `choosing sub-type ${chosen} (${VENCRYPT_SUB_NAMES[chosen]})`);

      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(chosen, 0);
      this.socket.write(buf);

      this._vencryptSubType = chosen;

      // Wait for server ack (1 byte) before proceeding
      this._state = 'vencrypt-subtype-ack';
      this._expectedBytes = 1;
      dbg('VENCRYPT', 'waiting for sub-type ack (1 byte)...');
    }
  }

  _handleVeNCryptSubtypeAck() {
    const ack = this._buffer.readUInt8(0);
    this._consume(1);
    dbg('VENCRYPT', `sub-type ack: ${ack} (${ack === 1 ? 'OK' : 'FAIL'})`);

    if (ack !== 1) {
      this.emit('handshake-error', new Error(`VeNCrypt: server rejected sub-type (ack=${ack})`));
      return;
    }

    const chosen = this._vencryptSubType;
    const needsTLS = [
      VENCRYPT_SUB.TLS_NONE, VENCRYPT_SUB.TLS_VNC, VENCRYPT_SUB.TLS_PLAIN,
      VENCRYPT_SUB.X509_NONE, VENCRYPT_SUB.X509_VNC, VENCRYPT_SUB.X509_PLAIN,
    ].includes(chosen);

    if (needsTLS) {
      dbg('VENCRYPT', 'upgrading socket to TLS...');
      this._state = 'vencrypt-tls';
      this._expectedBytes = Infinity; // Pause FSM while TLS handshakes
      this._upgradeToTLS();
    } else {
      // Plain (256) — no TLS, just send credentials
      this._vencryptDoInnerAuth();
    }
  }

  /**
   * Upgrade the raw TCP socket to TLS, then continue with inner auth.
   */
  _upgradeToTLS() {
    const rawSocket = this.socket;

    // Remove our data listener from the raw socket
    rawSocket.removeAllListeners('data');

    const tlsSocket = tls.connect({
      socket: rawSocket,
      rejectUnauthorized: false, // Self-signed certs are common on VNC servers
    });

    tlsSocket.on('secureConnect', () => {
      dbg('TLS', `connected — protocol: ${tlsSocket.getProtocol()}, cipher: ${tlsSocket.getCipher()?.name}`);
      this.socket = tlsSocket;
      this._buffer = Buffer.alloc(0);

      // Re-attach data listener on TLS socket
      tlsSocket.on('data', (data) => {
        this._onData(data);
      });

      // Now do inner auth
      this._vencryptDoInnerAuth();
    });

    tlsSocket.on('error', (err) => {
      dbg('TLS', `error: ${err.message}`);
      this.emit('handshake-error', new Error(`VeNCrypt TLS error: ${err.message}`));
    });
  }

  /**
   * Perform the inner authentication after VeNCrypt sub-type selection
   * (and TLS upgrade if applicable).
   */
  _vencryptDoInnerAuth() {
    const sub = this._vencryptSubType;

    // Plain auth: username + password
    if (sub === VENCRYPT_SUB.PLAIN || sub === VENCRYPT_SUB.TLS_PLAIN || sub === VENCRYPT_SUB.X509_PLAIN) {
      if (!this.username || !this.password) {
        this.emit('handshake-error', new Error('VeNCrypt Plain auth requires username and password'));
        return;
      }

      const userBuf = Buffer.from(this.username, 'utf-8');
      const passBuf = Buffer.from(this.password, 'utf-8');

      const header = Buffer.alloc(8);
      header.writeUInt32BE(userBuf.length, 0);
      header.writeUInt32BE(passBuf.length, 4);

      dbg('VENCRYPT-PLAIN', `sending username(${userBuf.length}) + password(${passBuf.length})`);
      this.socket.write(Buffer.concat([header, userBuf, passBuf]));

      this._state = 'security-result';
      this._expectedBytes = 4;
      dbg('VENCRYPT-PLAIN', 'waiting for security result...');
      return;
    }

    // VNC auth: challenge-response
    if (sub === VENCRYPT_SUB.TLS_VNC || sub === VENCRYPT_SUB.X509_VNC) {
      this._state = 'vnc-auth-challenge';
      this._expectedBytes = 16;
      dbg('VENCRYPT-VNC', 'waiting for VNC auth challenge (16 bytes)...');
      return;
    }

    // None auth: no credentials needed
    if (sub === VENCRYPT_SUB.TLS_NONE || sub === VENCRYPT_SUB.X509_NONE) {
      this._state = 'security-result';
      this._expectedBytes = 4;
      dbg('VENCRYPT-NONE', 'no auth needed, waiting for security result...');
      return;
    }

    this.emit('handshake-error', new Error(`VeNCrypt: unhandled inner auth for sub-type ${sub}`));
  }

  // ── ARD Authentication (type 30) ──────────────────────────

  _handleARDAuth() {
    if (!this._ardKeyLength) {
      if (this._buffer.length < 4) {
        this._expectedBytes = 4;
        return;
      }

      const generator = this._buffer.readUInt16BE(0);
      const keyLength = this._buffer.readUInt16BE(2);

      dbg('ARD', `generator=${generator}, keyLength=${keyLength}`);

      this._ardGenerator = generator;
      this._ardKeyLength = keyLength;

      const totalNeeded = 4 + keyLength * 2;
      dbg('ARD', `need ${totalNeeded} total bytes (have ${this._buffer.length})`);
      if (this._buffer.length < totalNeeded) {
        this._expectedBytes = totalNeeded;
        return;
      }
    }

    const keyLength = this._ardKeyLength;
    const totalNeeded = 4 + keyLength * 2;

    if (this._buffer.length < totalNeeded) {
      this._expectedBytes = totalNeeded;
      return;
    }

    const generator = this._ardGenerator;
    const prime = this._buffer.subarray(4, 4 + keyLength);
    const serverPublicKey = this._buffer.subarray(4 + keyLength, 4 + keyLength * 2);
    this._consume(totalNeeded);

    dbg('ARD', `prime (first 16 bytes): ${prime.subarray(0, 16).toString('hex')}`);
    dbg('ARD', `serverKey (first 16 bytes): ${serverPublicKey.subarray(0, 16).toString('hex')}`);

    delete this._ardGenerator;
    delete this._ardKeyLength;

    if (!this.username || !this.password) {
      this.emit('handshake-error', new Error('ARD authentication requires username and password'));
      return;
    }

    try {
      // Pure BigInt DH (matches noVNC's proven approach, avoids Node.js DH edge cases)
      const p = bufToBigInt(prime);
      const g = BigInt(generator);
      const Y = bufToBigInt(serverPublicKey);

      // Generate random private key
      const x = bufToBigInt(/** @type {Buffer} */ (crypto.randomBytes(keyLength)));

      // Compute client public key: X = g^x mod p
      const X = modpow(g, x, p);

      // Compute shared secret: S = Y^x mod p
      const S = modpow(Y, x, p);

      const clientPublicKey = bigIntToBuf(X, keyLength);
      const sharedSecret = bigIntToBuf(S, keyLength);

      dbg('ARD', `DH shared secret (${keyLength} bytes, first 16): ${sharedSecret.subarray(0, 16).toString('hex')}`);

      const aesKey = Buffer.from(/** @type {Uint8Array} */ (crypto.createHash('md5').update(sharedSecret).digest()));
      dbg('ARD', `AES key (MD5): ${aesKey.toString('hex')}`);

      const credentials = Buffer.alloc(128, 0);
      const userBuf = Buffer.from(this.username, 'utf-8');
      const passBuf = Buffer.from(this.password, 'utf-8');
      userBuf.copy(credentials, 0, 0, Math.min(userBuf.length, 63));
      passBuf.copy(credentials, 64, 0, Math.min(passBuf.length, 63));

      const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, Buffer.alloc(0));
      cipher.setAutoPadding(false);
      const encrypted = Buffer.concat(/** @type {Uint8Array[]} */ ([cipher.update(credentials), cipher.final()]));

      dbg('ARD', `sending encrypted creds (${encrypted.length} bytes) + clientKey (${clientPublicKey.length} bytes)`);
      this.socket.write(Buffer.concat([encrypted, clientPublicKey]));

      this._state = 'security-result';
      this._expectedBytes = 4;
      dbg('ARD', 'waiting for security result...');
    } catch (err) {
      dbg('ARD', `DH computation failed: ${err.message}`);
      this.emit('handshake-error', new Error(`ARD auth DH computation failed: ${err.message}`));
    }
  }

  // ── VNC Authentication (type 2) ───────────────────────────

  _handleVNCAuthChallenge() {
    const challenge = this._consume(16);
    dbg('VNC-AUTH', `challenge: ${challenge.toString('hex')}`);

    if (!this.password) {
      this.emit('handshake-error', new Error('VNC server requires a password but none configured'));
      return;
    }

    const response = this._vncEncrypt(challenge, this.password);
    dbg('VNC-AUTH', `response: ${response.toString('hex')}`);
    this.socket.write(response);
    this._state = 'security-result';
    this._expectedBytes = 4;
    dbg('VNC-AUTH', 'waiting for security result...');
  }

  _vncEncrypt(challenge, password) {
    const key = Buffer.alloc(8);
    const pwBytes = Buffer.from(password, 'ascii');
    for (let i = 0; i < 8; i++) {
      const byte = i < pwBytes.length ? pwBytes[i] : 0;
      key[i] = this._reverseBits(byte);
    }

    const desEcb = (block) => {
      try {
        const cipher = crypto.createCipheriv('des-ecb', key, Buffer.alloc(0));
        cipher.setAutoPadding(false);
        return cipher.update(block);
      } catch (err) {
        if (err.code === 'ERR_OSSL_EVP_UNSUPPORTED') {
          throw new Error('DES cipher unavailable. Set NODE_OPTIONS=--openssl-legacy-provider');
        }
        throw err;
      }
    };

    return Buffer.concat(/** @type {Uint8Array[]} */ ([desEcb(challenge.subarray(0, 8)), desEcb(challenge.subarray(8, 16))]));
  }

  _reverseBits(byte) {
    let result = 0;
    for (let i = 0; i < 8; i++) {
      result = (result << 1) | (byte & 1);
      byte >>= 1;
    }
    return result;
  }

  // ── Security Result ───────────────────────────────────────

  _handleSecurityResult() {
    const result = this._consume(4).readUInt32BE(0);
    dbg('SECURITY-RESULT', `result=${result} (${result === 0 ? 'OK' : 'FAILED'})`);

    if (result !== 0) {
      // RFB 003.008 sends a reason string after failure
      this._state = 'security-result-reason';
      this._expectedBytes = 4;
      return;
    }

    // Send ClientInit — shared flag = 1
    dbg('CLIENT-INIT', 'sending shared=1');
    const buf = Buffer.alloc(1);
    buf.writeUInt8(1, 0);
    this.socket.write(buf);

    this._state = 'server-init';
    this._expectedBytes = 24;
    dbg('CLIENT-INIT', 'waiting for ServerInit (24+ bytes)...');
  }

  _handleSecurityResultReason() {
    const reasonLen = this._buffer.readUInt32BE(0);
    const totalNeeded = 4 + reasonLen;

    if (this._buffer.length < totalNeeded) {
      this._expectedBytes = totalNeeded;
      return;
    }

    const reason = this._buffer.subarray(4, 4 + reasonLen).toString('utf-8');
    this._consume(totalNeeded);

    dbg('SECURITY-RESULT', `failure reason: "${reason}"`);
    this.emit('handshake-error', new Error(`VNC authentication failed: ${reason}`));
  }

  // ── Server Init ───────────────────────────────────────────

  _handleServerInit() {
    if (this._buffer.length < 24) return;

    this.width = this._buffer.readUInt16BE(0);
    this.height = this._buffer.readUInt16BE(2);

    this.pixelFormat = {
      bitsPerPixel: this._buffer.readUInt8(4),
      depth: this._buffer.readUInt8(5),
      bigEndian: this._buffer.readUInt8(6),
      trueColour: this._buffer.readUInt8(7),
      redMax: this._buffer.readUInt16BE(8),
      greenMax: this._buffer.readUInt16BE(10),
      blueMax: this._buffer.readUInt16BE(12),
      redShift: this._buffer.readUInt8(14),
      greenShift: this._buffer.readUInt8(15),
      blueShift: this._buffer.readUInt8(16),
    };

    dbg('SERVER-INIT', `display: ${this.width}x${this.height}`);
    dbg('SERVER-INIT', `pixel format: ${JSON.stringify(this.pixelFormat)}`);

    const nameLength = this._buffer.readUInt32BE(20);
    const totalNeeded = 24 + nameLength;

    if (this._buffer.length < totalNeeded) {
      this._expectedBytes = totalNeeded;
      dbg('SERVER-INIT', `need ${totalNeeded} bytes for name, have ${this._buffer.length}`);
      return;
    }

    this.serverName = this._buffer.subarray(24, 24 + nameLength).toString('utf-8');
    this._consume(totalNeeded);

    dbg('SERVER-INIT', `server name: "${this.serverName}"`);

    // Initialize framebuffer (RGBA)
    this.framebuffer = Buffer.alloc(this.width * this.height * 4, 0);
    dbg('SERVER-INIT', `framebuffer allocated: ${this.framebuffer.length} bytes`);

    // Set our preferred pixel format
    this._setPixelFormat();

    // Set supported encodings
    this._setEncodings();

    // Ready
    this.ready = true;
    this._state = 'message';
    this._expectedBytes = 1;
    this._startBackgroundSync();

    dbg('READY', `connected to "${this.serverName}" at ${this.width}x${this.height} (macOS=${this.isMacOS})`);

    this.emit('ready', {
      width: this.width,
      height: this.height,
      name: this.serverName,
    });
  }

  _setPixelFormat() {
    const buf = Buffer.alloc(20);
    buf.writeUInt8(C2S.SET_PIXEL_FORMAT, 0);
    buf.writeUInt8(32, 4);   // bits per pixel
    buf.writeUInt8(24, 5);   // depth
    buf.writeUInt8(0, 6);    // big-endian: no
    buf.writeUInt8(1, 7);    // true-colour: yes
    buf.writeUInt16BE(255, 8);  // red-max
    buf.writeUInt16BE(255, 10); // green-max
    buf.writeUInt16BE(255, 12); // blue-max
    buf.writeUInt8(0, 14);   // red-shift
    buf.writeUInt8(8, 15);   // green-shift
    buf.writeUInt8(16, 16);  // blue-shift

    this.pixelFormat = {
      bitsPerPixel: 32, depth: 24, bigEndian: 0, trueColour: 1,
      redMax: 255, greenMax: 255, blueMax: 255,
      redShift: 0, greenShift: 8, blueShift: 16,
    };

    dbg('PIXEL-FORMAT', 'set to 32bpp RGBX');
    this.socket.write(buf);
  }

  _setEncodings() {
    const encodings = [ENCODING.RAW, ENCODING.COPY_RECT, ENCODING.DESKTOP_SIZE];
    const buf = Buffer.alloc(4 + encodings.length * 4);
    buf.writeUInt8(C2S.SET_ENCODINGS, 0);
    buf.writeUInt16BE(encodings.length, 2);
    encodings.forEach((enc, i) => buf.writeInt32BE(enc, 4 + i * 4));
    dbg('ENCODINGS', `set: [${encodings.join(', ')}]`);
    this.socket.write(buf);
  }

  // ── Server Message Handling ────────────────────────────────

  _handleServerMessage() {
    if (this._buffer.length < 1) return;

    const msgType = this._buffer.readUInt8(0);

    switch (msgType) {
      case S2C.FRAMEBUFFER_UPDATE:
        this._handleFramebufferUpdate();
        break;
      case S2C.SET_COLOUR_MAP:
        this._handleSetColourMap();
        break;
      case S2C.BELL:
        dbg('MSG', 'bell');
        this._consume(1);
        this._expectedBytes = 1;
        break;
      case S2C.SERVER_CUT_TEXT:
        this._handleServerCutText();
        break;
      default:
        dbg('MSG', `unknown server message type: ${msgType}`);
        this._consume(1);
        this._expectedBytes = 1;
        break;
    }
  }

  _handleFramebufferUpdate() {
    if (this._buffer.length < 4) {
      this._expectedBytes = 4;
      return;
    }

    const numRects = this._buffer.readUInt16BE(2);
    let offset = 4;

    for (let r = 0; r < numRects; r++) {
      if (this._buffer.length < offset + 12) {
        this._expectedBytes = offset + 12;
        return;
      }

      const x = this._buffer.readUInt16BE(offset);
      const y = this._buffer.readUInt16BE(offset + 2);
      const w = this._buffer.readUInt16BE(offset + 4);
      const h = this._buffer.readUInt16BE(offset + 6);
      const encoding = this._buffer.readInt32BE(offset + 8);
      offset += 12;

      if (encoding === ENCODING.RAW) {
        const bytesPerPixel = this.pixelFormat.bitsPerPixel / 8;
        const dataLen = w * h * bytesPerPixel;

        if (this._buffer.length < offset + dataLen) {
          this._expectedBytes = offset + dataLen;
          return;
        }

        // Fast path: full-width row copy (RGBX → RGBA)
        const rowBytes = w * bytesPerPixel;
        for (let row = 0; row < h; row++) {
          const srcStart = offset + row * rowBytes;
          const dstStart = ((y + row) * this.width + x) * 4;
          // Source is RGBX, dest is RGBA — same layout, just set alpha
          this._buffer.copy(this.framebuffer, dstStart, srcStart, srcStart + rowBytes);
          // Set alpha channel to 255 for each pixel in the row
          for (let col = 0; col < w; col++) {
            this.framebuffer[dstStart + col * 4 + 3] = 255;
          }
        }

        offset += dataLen;
        this.framebufferDirty = true;

      } else if (encoding === ENCODING.DESKTOP_SIZE) {
        dbg('FB', `desktop resize: ${w}x${h}`);
        this.width = w;
        this.height = h;
        this.framebuffer = Buffer.alloc(w * h * 4, 0);
        this.emit('resize', { width: w, height: h });

      } else if (encoding === ENCODING.COPY_RECT) {
        if (this._buffer.length < offset + 4) {
          this._expectedBytes = offset + 4;
          return;
        }
        const srcX = this._buffer.readUInt16BE(offset);
        const srcY = this._buffer.readUInt16BE(offset + 2);
        offset += 4;

        const temp = Buffer.alloc(w * h * 4);
        for (let row = 0; row < h; row++) {
          const srcOff = ((srcY + row) * this.width + srcX) * 4;
          const tmpOff = row * w * 4;
          this.framebuffer.copy(temp, tmpOff, srcOff, srcOff + w * 4);
        }
        for (let row = 0; row < h; row++) {
          const dstOff = ((y + row) * this.width + x) * 4;
          const tmpOff = row * w * 4;
          temp.copy(this.framebuffer, dstOff, tmpOff, tmpOff + w * 4);
        }
        this.framebufferDirty = true;

      } else {
        dbg('FB', `unknown encoding ${encoding}, skipping rest of update`);
        this._consume(offset);
        this._expectedBytes = 1;
        this._resolveScreenshot();
        return;
      }
    }

    this._consume(offset);
    this._expectedBytes = 1;
    this._resolveScreenshot();
  }

  _handleSetColourMap() {
    if (this._buffer.length < 6) { this._expectedBytes = 6; return; }
    const numColours = this._buffer.readUInt16BE(4);
    const total = 6 + numColours * 6;
    if (this._buffer.length < total) { this._expectedBytes = total; return; }
    dbg('MSG', `colour map: ${numColours} entries`);
    this._consume(total);
    this._expectedBytes = 1;
  }

  _handleServerCutText() {
    if (this._buffer.length < 8) { this._expectedBytes = 8; return; }
    const len = this._buffer.readUInt32BE(4);
    const total = 8 + len;
    if (this._buffer.length < total) { this._expectedBytes = total; return; }
    dbg('MSG', `server cut text: ${len} bytes`);
    this._consume(total);
    this._expectedBytes = 1;
  }

  _resolveScreenshot() {
    if (this._pendingScreenshot) {
      const p = this._pendingScreenshot;
      this._pendingScreenshot = null;
      clearTimeout(p.timer);
      p.resolve();
    }
    this.emit('frame');
  }

  // ── Background Framebuffer Sync ──────────────────────────

  /**
   * Start background incremental framebuffer updates (10fps).
   * Keeps the framebuffer fresh so screenshot/crop calls are near-instant.
   */
  _startBackgroundSync() {
    this._syncInterval = setInterval(() => {
      if (this.ready && this.connected) {
        this._requestFramebufferUpdate(true);
      }
    }, 100);
    dbg('SYNC', 'background framebuffer sync started (10fps)');
  }

  // ── Public API: Screenshot ────────────────────────────────

  /**
   * Request a full framebuffer update and return it as PNG.
   * @returns {Promise<import('./types').ScreenshotResult>}
   */
  async screenshot() {
    if (!this.connected) throw new Error('VNC not connected');
    this._requestFramebufferUpdate(false);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._pendingScreenshot) {
          dbg('SCREENSHOT', 'timeout — using current framebuffer');
          this._pendingScreenshot = null;
          resolve();
        }
      }, 2000);
      timer.unref();
      this._pendingScreenshot = { resolve, reject, timer };
    });

    const pngBuffer = await sharp(this.framebuffer, {
      raw: { width: this.width, height: this.height, channels: 4 },
    }).png().toBuffer();

    this.framebufferDirty = false;

    return {
      buffer: pngBuffer,
      base64: pngBuffer.toString('base64'),
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Get a copy of the raw RGBA framebuffer (no PNG encode).
   * @returns {Buffer}
   */
  getFramebufferCopy() {
    return Buffer.from(this.framebuffer);
  }

  /**
   * Request a framebuffer update and wait for it to arrive.
   * @param {boolean} incremental
   * @param {number} timeoutMs
   * @returns {Promise<boolean>} true if update received
   */
  async waitForFrame(incremental, timeoutMs) {
    this._requestFramebufferUpdate(incremental);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.removeListener('frame', onFrame);
        resolve(false);
      }, timeoutMs);
      timer.unref();
      const onFrame = () => { clearTimeout(timer); resolve(true); };
      this.once('frame', onFrame);
    });
  }

  _requestFramebufferUpdate(incremental) {
    const buf = Buffer.alloc(10);
    buf.writeUInt8(C2S.FRAMEBUFFER_UPDATE_REQUEST, 0);
    buf.writeUInt8(incremental ? 1 : 0, 1);
    buf.writeUInt16BE(0, 2);
    buf.writeUInt16BE(0, 4);
    buf.writeUInt16BE(this.width, 6);
    buf.writeUInt16BE(this.height, 8);
    this.socket.write(buf);
  }

  // ── Public API: Mouse ─────────────────────────────────────

  /**
   * Send a VNC PointerEvent (mouse movement/click).
   * @param {number} x
   * @param {number} y
   * @param {number} [buttonMask=0]
   */
  pointerEvent(x, y, buttonMask = 0) {
    const buf = Buffer.alloc(6);
    buf.writeUInt8(C2S.POINTER_EVENT, 0);
    buf.writeUInt8(buttonMask, 1);
    buf.writeUInt16BE(Math.max(0, Math.min(x, this.width - 1)), 2);
    buf.writeUInt16BE(Math.max(0, Math.min(y, this.height - 1)), 4);
    this.socket.write(buf);
  }

  // ── Public API: Keyboard ──────────────────────────────────

  /**
   * Send a VNC KeyEvent (key press/release).
   * @param {number} keysym - X11 keysym value
   * @param {boolean} down - true for key down, false for key up
   */
  keyEvent(keysym, down) {
    // macOS: Apple VNC expects Super_L/R for Command, not Meta_L/R
    if (this.isMacOS) {
      if (keysym === 0xFFE7) keysym = 0xFFEB; // Meta_L → Super_L
      if (keysym === 0xFFE8) keysym = 0xFFEC; // Meta_R → Super_R
    }
    const buf = Buffer.alloc(8);
    buf.writeUInt8(C2S.KEY_EVENT, 0);
    buf.writeUInt8(down ? 1 : 0, 1);
    buf.writeUInt32BE(keysym, 4);
    this.socket.write(buf);
  }

  // ── Public API: Clipboard ──────────────────────────────────

  /**
   * Send text to the VNC server clipboard (ClientCutText).
   * @param {string} text - Text to place on the remote clipboard
   */
  setClipboard(text) {
    const textBuf = Buffer.from(text, 'utf-8');
    const buf = Buffer.alloc(8 + textBuf.length);
    buf.writeUInt8(C2S.CLIENT_CUT_TEXT, 0);
    // 3 bytes padding
    buf.writeUInt32BE(textBuf.length, 4);
    textBuf.copy(buf, 8);
    this.socket.write(buf);
  }

  // ── Disconnect ─────────────────────────────────────────────

  disconnect() {
    if (!this.connected) return;
    dbg('DISCONNECT', 'closing socket');
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
      this._syncInterval = null;
    }
    if (this._pendingScreenshot) {
      clearTimeout(this._pendingScreenshot.timer);
      this._pendingScreenshot = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
      this.ready = false;
    }
  }
}
