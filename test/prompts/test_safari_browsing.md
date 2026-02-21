# Safari Browsing Task

Complete the following task on the macOS desktop:

## Goal

Open Safari, navigate to a website, scroll through the page, and click the contact section.

## Steps

1. Open Safari — use Spotlight (Cmd+Space), type "Safari", press Return
2. Wait for Safari to open, then click the address bar (Cmd+L)
3. Type "artek.tc" using key_type, then press Return
4. Wait for the page to load, then use detect_elements to read the page content
5. Scroll down the page using Page Down (key_tap "pagedown") — repeat 3-4 times to reach the bottom
6. After reaching the bottom, scroll back to the top using Cmd+Up (key_combo ["command","up"])
7. Use detect_elements to find the contact/iletişim section link
8. Click the contact/iletişim link
9. Verify the contact section is visible, then call task_complete()

## Rules

- Use detect_elements (not screenshot) to find clickable targets
- Use key_type for typing the URL
- Use Cmd+L to focus the address bar
- Use key_tap "pagedown" for scrolling down
- Use action_queue to batch actions where possible
- If a Welcome/start page appears, dismiss it first
- Safari uses Cmd-based shortcuts, not Ctrl
