// SPDX-License-Identifier: MIT
// ─────────────────────────────────────────────────────────────
// CLibVNCClient — Umbrella Header for Swift FFI
//
// This header re-exports the LibVNCClient public API so that
// Swift can import it as a C module:
//
//   import CLibVNCClient
//
// The actual headers are installed by the LibVNC build into
// vendor/libvnc/dist/include/rfb/
// ─────────────────────────────────────────────────────────────

#ifndef CLIBVNCCLIENT_H
#define CLIBVNCCLIENT_H

#include <rfb/rfbclient.h>

#endif /* CLIBVNCCLIENT_H */
