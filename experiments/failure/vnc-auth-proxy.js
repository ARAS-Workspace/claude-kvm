#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * VNC Auth Type Proxy
 *
 * Sits between the daemon and macOS Screen Sharing.
 * Intercepts the RFB handshake and replaces the security type list
 * with only type 2 (VNC password auth), stripping ARD type 30.
 *
 * Usage: node vnc-auth-proxy.js [listenPort] [vncPort]
 */

import { createServer, connect } from 'node:net';

const LISTEN_PORT = parseInt(process.argv[2] || '5901', 10);
const VNC_PORT = parseInt(process.argv[3] || '5900', 10);
const VNC_HOST = '127.0.0.1';

const server = createServer(client => {
  const vnc = connect(VNC_PORT, VNC_HOST);
  // Handshake phases: 0=server_version, 1=client_version, 2=sec_types, 3=sec_select, 4=passthrough
  let phase = 0;

  vnc.on('data', /** @param {Buffer} chunk */ chunk => {
    if (phase === 0) {
      // Server → Client: RFB version string (12 bytes)
      client.write(Buffer.from(chunk));
      phase = 1;
    } else if (phase === 2) {
      // Server → Client: security types — replace with type 2 only
      const buf = Buffer.from(chunk);
      const types = [...buf.subarray(1)];
      console.log(`[proxy] Server offered types: [${types.join(',')}] → forcing [2]`);
      client.write(Buffer.from([1, 2]));
      phase = 3;
    } else {
      client.write(Buffer.from(chunk));
    }
  });

  client.on('data', /** @param {Buffer} chunk */ chunk => {
    if (phase === 1) {
      // Client → Server: RFB version string
      vnc.write(Buffer.from(chunk));
      phase = 2;
    } else if (phase === 3) {
      // Client → Server: selected type — force type 2 to real server
      const buf = Buffer.from(chunk);
      console.log(`[proxy] Client selected type ${buf[0]} → sending 2 to server`);
      vnc.write(Buffer.from([2]));
      phase = 4;
    } else {
      vnc.write(Buffer.from(chunk));
    }
  });

  vnc.on('end', () => client.end());
  client.on('end', () => vnc.end());
  vnc.on('error', err => { console.error(`[proxy] VNC error: ${err.message}`); client.destroy(); });
  client.on('error', err => { console.error(`[proxy] Client error: ${err.message}`); vnc.destroy(); });
});

server.listen(LISTEN_PORT, VNC_HOST, () => {
  console.log(`[proxy] VNC auth proxy: ${VNC_HOST}:${LISTEN_PORT} → ${VNC_HOST}:${VNC_PORT} (type 2 only)`);
});
