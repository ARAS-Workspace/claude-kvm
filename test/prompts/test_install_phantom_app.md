# Phantom-WG App Installation Task

Complete the following task on the macOS desktop:

## Goal

Download the Phantom-WG Mac app from GitHub releases, install it to Applications, grant necessary permissions, and launch it.

## Steps

1. Open Safari — use Spotlight (Cmd+Space), type "Safari", press Return
2. Click the address bar (Cmd+L), type "https://github.com/ARAS-Workspace/phantom-wg" using key_type, press Return
3. Wait for the page to load, use detect_elements to find "Releases" on the right sidebar and click it
4. On the releases page, find "Phantom-WG Mac 1.0.0" and click it
5. Scroll down (key_tap "pagedown") to reach the Assets section at the bottom of the release page
6. Find the `.dmg` file in the Assets list and click it to start downloading
7. Wait for the download to complete — check the Downloads bar or use Cmd+Option+L to open Downloads
8. Open the downloaded `.dmg` file — double-click it from Downloads or Finder
9. When the DMG mounts, do NOT drag directly from the DMG window. Instead:
   - Open a new Finder window (Cmd+N)
   - Navigate to Applications in the sidebar
   - Drag the Phantom-WG app from the DMG window into the Applications folder in the Finder window
10. If a "move to Applications" confirmation or "app from the internet" warning appears, click "Open" or "Move" to proceed
11. Launch Phantom-WG from Applications — double-click it or use Spotlight
12. If macOS shows "app downloaded from the internet" dialog, click "Open"
13. If System Extensions permission is requested:
    - Click "Open System Settings" or navigate to System Settings > Privacy & Security
    - Find the System Extensions or Network Extensions section
    - Click "Allow" to grant the permission
    - Return to the app if needed
14. Once the Phantom-WG client window is fully visible and loaded, call task_complete()

## Rules

- Use detect_elements (not screenshot) to find clickable targets
- Use key_type for typing URLs and text
- Use action_queue to batch actions where possible
- Safari uses Cmd-based shortcuts, not Ctrl
- Be patient with downloads and DMG mounting — use wait(2000) between checks
- Handle ALL dialogs and permission prompts intelligently — always proceed toward completing the installation
- If a dialog appears that you don't recognize, use detect_elements to read it and choose the option that continues the installation
- If dragging fails, try alternative installation methods (e.g., copy-paste in Finder, or right-click > Copy then Paste)
- Do not give up on permission dialogs — navigate System Settings if needed to grant access
- This is a complex multi-step task — stay focused on the end goal: app running successfully