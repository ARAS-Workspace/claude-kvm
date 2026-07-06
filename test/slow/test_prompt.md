# Uppercase Typing Task (issue #9)

Complete the following task on the XFCE desktop (1280x720):

## Goal

Prove that text typed character-by-character (`key_type`) arrives with its
case intact. The historical bug: every uppercase letter arrived lowercase
(`TEST CASE ABC` → `test case abc`).

## Steps

1. Open a terminal — click the terminal launcher (`$_` icon) in the bottom dock ONCE, then wait 5 seconds (first launch on this machine is slow)
2. Take a screenshot to confirm the terminal is open and focused. If it is not open yet, wait 5 more seconds and screenshot again before trying anything else. Fallback if the dock launcher fails twice: Applications menu (top-left) → Terminal Emulator
3. Using key_type (NOT paste), type exactly: `echo TEST CASE ABC` — then key_tap("return")
4. Using key_type (NOT paste), type exactly: `echo MixedCase Works !@#` — then key_tap("return")
5. Take a screenshot — this is the visual evidence; the terminal must show both commands AND their echoed output
6. verify() with the observer: "Does the terminal show the command `echo TEST CASE ABC` and its output `TEST CASE ABC` in UPPERCASE letters, and `MixedCase Works !@#` with its mixed case intact?"
7. If every letter's case is intact, call task_complete() with a summary quoting the exact text seen
8. If any text appears lowercased (e.g. `test case abc`), call task_failed() quoting the exact wrong text — do NOT retry with paste

## Rules

- key_type is the entire point of this test — NEVER use paste for the echo commands
- NEVER right-click the desktop background — its context menu freezes the pointer on this VNC setup and the session cannot recover. If a context menu is somehow open, press key_tap("Escape") first
- Do not double-click dock launchers; one click is enough — double-clicking opens two terminals
- Be patient: after any click, prefer action_queue([click, wait(3000)]) and check the result before clicking again
- Use detect_elements (not screenshot) to find clickable targets
- The two screenshots (steps 2 and 5) are mandatory — they are the visual record of the run