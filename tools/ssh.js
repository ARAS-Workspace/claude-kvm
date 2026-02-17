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

import { z } from 'zod';

/**
 * SSH tool definitions.
 * @returns {Array<{name: string, description: string, inputSchema: Record<string, import('zod').ZodType>}>}
 */
export function sshTools() {
  return [
    {
      name: 'ssh',
      description: [
        'Execute a command on the remote machine via SSH.',
        'Returns stdout, stderr, and exit code. Use for any shell operation on the target system.',
        '',
        'Capabilities:',
        '- File system operations: ls, cat, mkdir, cp, mv, rm',
        '- Process management: ps, kill, top',
        '- System info: uname, hostname, df, free',
        '- Package management: apt, brew, etc.',
        '- Network: curl, wget, ping, netstat',
        '',
        'macOS-specific (when VNC target is macOS):',
        '- AppleScript: osascript -e \'tell application "Finder" to get name of every window\'',
        '- UI validation: osascript to verify UI state after VNC actions',
        '- App control: open -a "Safari", osascript to interact with apps',
        '- System preferences: defaults read, defaults write',
        '- Clipboard: pbcopy, pbpaste (direct system clipboard access)',
        '- Screenshots with metadata: screencapture command',
        '',
        'Tips:',
        '- On macOS, combine VNC visual actions with SSH osascript validation for reliable automation.',
        '- Use pbpaste via SSH to read clipboard contents after a VNC copy action.',
        '- Use osascript to get precise window positions, button states, and menu items.',
        '- Requires SSH_HOST, SSH_USER, and SSH_PASSWORD or SSH_KEY environment variables.',
        '',
        'macOS permission dialogs:',
        '- First-time osascript access to an app (System Events, Finder, etc.) triggers a macOS permission dialog.',
        '- The SSH command will timeout while waiting for approval. Use VNC screenshot to check for the dialog, click "Allow", then retry the command.',
      ].join('\n'),
      inputSchema: {
        command: z.string().describe('The shell command to execute on the remote machine'),
        timeout: z.number().int().min(1000).max(120000).optional()
          .describe('Command timeout in milliseconds (default: 30000, max: 120000)'),
      },
    },
  ];
}
