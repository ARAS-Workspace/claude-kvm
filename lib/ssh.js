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

import { Client } from 'ssh2';
import { readFileSync } from 'node:fs';

function dbg(label, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[SSH ${ts}] ${label}`, ...args);
}

export class SSHClient {
  /**
   * @param {import('./types.js').SSHConnectionConfig} config
   */
  constructor(config) {
    this.host = config.host;
    this.port = config.port || 22;
    this.username = config.username;
    this.password = config.password || null;
    this.privateKeyPath = config.privateKeyPath || null;

    /** @type {import('ssh2').Client | null} */
    this._client = null;
    /** @type {boolean} */
    this.connected = false;
    /** @type {boolean} */
    this.connecting = false;
    /** @type {number} */
    this.commandCount = 0;

    dbg('INIT', `target=${this.host}:${this.port} user=${this.username} auth=${this.password ? 'password' : this.privateKeyPath ? 'key' : 'none'}`);
  }

  /**
   * Connect to the SSH server. Resolves when ready.
   * @returns {Promise<void>}
   */
  connect() {
    if (this.connected) return Promise.resolve();
    if (this.connecting) return this._connectPromise;

    this.connecting = true;
    this._connectPromise = new Promise((resolve, reject) => {
      this._client = new Client();

      const connectConfig = {
        host: this.host,
        port: this.port,
        username: this.username,
        readyTimeout: 10000,
      };

      if (this.privateKeyPath) {
        try {
          connectConfig.privateKey = readFileSync(this.privateKeyPath);
          dbg('AUTH', `using key: ${this.privateKeyPath}`);
        } catch (err) {
          this.connecting = false;
          reject(new Error(`Failed to read SSH key: ${err.message}`));
          return;
        }
      } else if (this.password) {
        connectConfig.password = this.password;
        dbg('AUTH', 'using password');
      }

      this._client.on('ready', () => {
        dbg('READY', `connected to ${this.host}:${this.port}`);
        this.connected = true;
        this.connecting = false;
        resolve();
      });

      this._client.on('error', (err) => {
        dbg('ERROR', err.message);
        if (this.connecting) {
          this.connecting = false;
          reject(new Error(`SSH connection failed: ${err.message}`));
        }
      });

      this._client.on('close', () => {
        dbg('CLOSE', 'connection closed');
        this.connected = false;
        this.connecting = false;
        this._client = null;
      });

      dbg('CONNECT', `opening SSH to ${this.host}:${this.port}...`);
      this._client.connect(connectConfig);
    });

    return this._connectPromise;
  }

  /**
   * Execute a command over SSH.
   * @param {string} command
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async exec(command, timeoutMs = 30000) {
    if (!this.connected) {
      await this.connect();
    }

    this.commandCount++;
    dbg('EXEC', `[#${this.commandCount}] ${command}`);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`SSH command timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this._client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(new Error(`SSH exec error: ${err.message}`));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data) => { stdout += data.toString(); });
        stream.stderr.on('data', (data) => { stderr += data.toString(); });

        stream.on('close', (code) => {
          clearTimeout(timer);
          dbg('EXEC', `[#${this.commandCount}] exit=${code} stdout=${stdout.length}B stderr=${stderr.length}B`);
          resolve({ stdout, stderr, code: code ?? 0 });
        });
      });
    });
  }

  /**
   * Disconnect from the SSH server.
   */
  disconnect() {
    dbg('DISCONNECT', 'closing connection');
    if (this._client) {
      this._client.end();
      this._client = null;
    }
    this.connected = false;
    this.connecting = false;
  }
}
