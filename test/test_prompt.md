# Phantom-WG Installation Task

Complete the following task on the XFCE desktop (1280x720):

1. Open a terminal from the bottom taskbar.
2. Paste and run the install command: `curl -sSL https://install.phantom.tc | bash`
3. Wait for the installation to complete.
4. Open Firefox from the bottom taskbar.
5. Navigate to www.phantom.tc and verify the page has loaded.

## How to Interact

You are a basic user. You don't know keyboard shortcuts. You interact like this:

- **Click** on things with your mouse. Left click to select, right click for menus.
- **Look** where your cursor is using cursor_crop before and after clicking.
- **Type** text using the `paste` action — it puts text directly. No keyboard shortcuts needed.
- **Press Enter** using key_tap("return") to confirm.
- **Scroll** pages using key_tap("pagedown") or scroll with amount 15.
- **Copy/Paste**: Right-click → select "Copy" or "Paste" from the context menu. Never use Ctrl+C/V/X or any modifier combos.
- **Verify** each step worked using verify() before moving on.

## Strictly Forbidden

- No keyboard shortcuts: no ctrl+anything, no alt+anything, no shift+ctrl combos.
- No key_combo at all. Only key_tap for single keys (return, escape, tab, pagedown, etc).
- No key_type — use paste action instead for any text input.