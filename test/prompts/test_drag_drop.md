A DMG file named "Phantom-WG-MacOS-1.0.0.dmg" is on the Desktop.

1. Use detect_elements to find "Phantom-WG-MacOS-1.0.0.dmg" on the Desktop
2. Drag it to the center point between the two eyes of the ghost in the background wallpaper
3. Use detect_elements to verify the file is now at the new position
4. Double-click the DMG file to mount it
5. Wait for the DMG window to appear — use wait(2000) then detect_elements to confirm
6. Open Finder (Cmd+N), navigate to Applications in the sidebar (Cmd+Shift+A)
7. Position the Finder window and the DMG window side by side so both are visible
8. Drag the Phantom-WG app from the DMG window into the Applications folder in the Finder window
9. If a replace or confirmation dialog appears, accept it
10. Use detect_elements in the Applications Finder window to verify "Phantom" is listed
11. Call task_complete()

Rules:
- Use detect_elements before every click or drag action
- Use action_queue to batch actions where possible
- For drag operations: mouse_down at source, then mouse_up at destination
- Be patient with DMG mounting — use wait(2000) between checks
- Do NOT use the Applications shortcut inside the DMG — open a real Finder window for Applications