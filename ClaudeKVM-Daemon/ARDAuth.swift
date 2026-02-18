/**
 *  █████╗ ██████╗  █████╗ ███████╗
 * ██╔══██╗██╔══██╗██╔══██╗██╔════╝
 * ███████║██████╔╝███████║███████╗
 * ██╔══██║██╔══██╗██╔══██║╚════██║
 * ██║  ██║██║  ██║██║  ██║███████║
 * ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 *
 * Copyright (c) 2025 Riza Emre ARAS <r.emrearas@proton.me>
 *
 * This file is part of Claude KVM.
 * Released under the MIT License - see LICENSE for details.
 */

// Apple Remote Desktop (ARD) Authentication callback for LibVNCClient.
//
// LibVNCClient has built-in ARD auth (security type 30) support but
// requires a GetCredential callback to supply username + password.
// This file provides that callback.

import Foundation
import CLibVNCClient

// MARK: - GetCredential Callback

/// Called by LibVNCClient when ARD auth needs username + password.
/// LibVNCClient will call free() on the returned credential struct.
func vncGetCredential(
    _ client: UnsafeMutablePointer<rfbClient>?,
    _ credentialType: Int32
) -> UnsafeMutablePointer<rfbCredential>? {
    guard let client else { return nil }
    guard let b = bridge(from: client) else { return nil }

    if credentialType == rfbCredentialTypeUser {
        let username = b.config.username ?? ""
        let password = b.config.password ?? ""

        // Allocate credential — LibVNCClient calls free() on it
        let cred = UnsafeMutablePointer<rfbCredential>.allocate(capacity: 1)
        cred.pointee.userCredential.username = strdup(username)
        cred.pointee.userCredential.password = strdup(password)
        return cred
    }

    return nil
}
