A DMG file named "Phantom-WG-MacOS-1.0.0.dmg" is on the Desktop.

1. Use detect_elements to find "Phantom-WG-MacOS-1.0.0.dmg" on the Desktop
2. Drag it to the center point between the two eyes of the ghost in the background wallpaper
3. Use detect_elements to verify the file is now at the new position
4. Double-click the DMG file to mount it
5. Wait for the DMG window to appear — use wait(2000) then detect_elements to confirm
6. In the DMG window, find the Phantom-WG app icon and the Applications shortcut folder
7. Drag the Phantom-WG app onto the Applications shortcut in the DMG window
8. If a replace or confirmation dialog appears, accept it
9. Open Finder (Cmd+N), press Cmd+Shift+A to go to Applications
10. Use detect_elements to search for "Phantom" in the Applications list and verify the app is installed
11. Call task_complete()

Rules:
- Use detect_elements before every click or drag action
- Use action_queue to batch actions where possible
- For drag operations: mouse_down at source, then mouse_up at destination
- Be patient with DMG mounting — use wait(2000) between checks
- If drag fails, try alternative: right-click > Copy on app, then right-click > Paste in Applications
