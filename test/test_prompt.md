# Phantom-WG Installation Task

Complete the following task on the XFCE desktop (1280x720):

## Step 1 — Open Firefox

Click the Firefox icon in the bottom taskbar (globe/fox icon, near center of the panel).
Wait 3 seconds for it to launch.

## Step 2 — Navigate to URL

Ignore any Welcome wizard — go straight to the address bar.

1. Click the address bar at the top of Firefox
2. Press key_tap("escape") to dismiss any dropdown
3. Use paste("https://github.com/ARAS-Workspace/phantom-wg#quick-start")
4. Press key_tap("return")
5. Wait 5 seconds for the page to load

All 5 actions can go in a single action_queue.

## Step 3 — Copy the install command

Find the install command: `curl -sSL https://install.phantom.tc | bash`
Click the copy icon (clipboard button) next to the code block.

## Step 4 — Open terminal

Click the terminal icon in the bottom taskbar (black icon with "$" symbol).
Wait 2 seconds for it to open.

## Step 5 — Paste and run

The clipboard already has the command from step 3.

1. Right-click inside the terminal window
2. Click "Paste" from the context menu
3. Press key_tap("return") to run

## Step 6 — Done

Wait for the installation output, then call task_complete().

## Rules

- Use action_queue to batch multiple actions in one turn
- Use verify() after each step to confirm it worked
- Use paste() for all text input — never key_type
- Only key_tap for single keys: return, escape, tab, space, pagedown
- No key_combo — no ctrl+anything, no alt+anything
- Terminal paste: right-click → Paste (paste() action does NOT work in terminals)
