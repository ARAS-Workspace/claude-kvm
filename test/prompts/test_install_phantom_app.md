## General Rules

- **Scrolling:** The scroll action runs client-side and has minimal effect per tick. Prefer key_tap "pagedown" / "pageup" to navigate pages. If you must use scroll, repeat it 5–10 times in an action_queue to cover meaningful distance.

# Download

Search for Phantom-WG on Google, find the GitHub repository, and download the DMG installer from releases.

1. Open Safari — use Spotlight (Cmd+Space), type "Safari", press Return
2. Click the address bar (Cmd+L), type "google.com" using key_type, press Return
3. In the Google search bar, type "Phantom-WG" and press Return
4. Use detect_elements to find the GitHub link (github.com/ARAS-Workspace/phantom-wg) in the results and click it
5. On the GitHub page, scroll down (key_tap "pagedown") until you find "Releases" on the right sidebar, then click it
6. On the releases page, find "Phantom-WG Mac 1.0.0" and click it
7. Scroll down (key_tap "pagedown") to reach the Assets section at the bottom of the release page
8. Find the `.dmg` file in the Assets list and click it to start downloading
9. Wait for the download to complete — check Safari's downloads indicator (View > Show Downloads)
10. Verify the DMG file is fully downloaded, then call task_complete()

Rules:
- Use detect_elements (not screenshot) to find clickable targets
- Use key_type for typing URLs
- Use action_queue to batch actions where possible
- Safari uses Cmd-based shortcuts, not Ctrl
- Be patient with the download — use wait(2000) between status checks

# Install

The DMG file has already been downloaded to the Downloads folder. Mount it and install the app to Applications.

1. Open Finder — click the Finder icon in the Dock or use Cmd+N
2. Navigate to Downloads in the sidebar
3. Find "Phantom-WG-MacOS-1.0.0.dmg" and double-click it to mount
4. Wait for the DMG to mount — a new window should appear
5. Open a separate Finder window (Cmd+N) and navigate to Applications in the sidebar
6. Drag the Phantom-WG app from the DMG window into the Applications folder
7. If a confirmation or "app from the internet" warning appears, click "Open" or "Move" to proceed
8. Verify the app is in Applications, then call task_complete()

Rules:
- Use detect_elements to find clickable targets
- Use action_queue to batch actions where possible
- If dragging fails, try right-click > Copy on the app, then right-click > Paste in Applications
- Handle any dialog that appears by choosing the option that continues the installation
- Be patient with DMG mounting — use wait(2000) between checks

# Launch

Phantom-WG has been installed to Applications. Launch it and handle any initial permission dialogs.

1. Open Spotlight (Cmd+Space), type "Phantom", press Return to launch the app
2. If macOS shows "app downloaded from the internet" dialog, click "Open"
3. If System Extensions permission is requested, click "Open System Settings" or "Allow"
4. If you are redirected to System Settings > Privacy & Security, find the allow/permit button and click it
5. Return to the app if needed — use Spotlight or click it in the Dock
6. Once you see the Phantom-WG window (even partially loaded), call task_complete()

Rules:
- Use detect_elements to read every dialog before acting
- Use action_queue to batch actions where possible
- Do not give up on permission dialogs — always choose the option that proceeds
- If the app closes after granting permissions, relaunch it
- Focus on speed — get to the app window as fast as possible

# Verify

Phantom-WG should be running. Confirm the client window is fully loaded and visible.

1. Use detect_elements to check the current screen
2. If the Phantom-WG app is not in the foreground, find it in the Dock and click it
3. If any remaining permission dialog appears, handle it and proceed
4. Once the Phantom-WG client window is fully visible and loaded, call task_complete()

Rules:
- Use detect_elements to confirm the app window content
- Follow the flow — if something unexpected appears, read it and adapt
- This is the final verification step — just confirm the app is running