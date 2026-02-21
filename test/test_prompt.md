# Finder Task

Complete the following task on the macOS desktop:

## Goal

Open Finder, create a directory structure, and verify the result.

## Steps

1. Open Finder — click the Finder icon in the Dock, or use Cmd+N if Finder is already active
2. Navigate to the Desktop folder in the sidebar
3. Create a new folder — Shift+Cmd+N, type "claude-kvm-test", press Return
4. Open "claude-kvm-test" — double-click it
5. Inside it, create another folder — Shift+Cmd+N, type "logs", press Return
6. Verify both folders exist, then call task_complete()

## Rules

- Use detect_elements (not screenshot) to find clickable targets
- Use key_type to enter folder names (paste doesn't work in macOS dialogs)
- Use Shift+Cmd+N (key_combo with keys ["shift","command","n"]) to create folders
- Use action_queue to batch actions
- Finder uses Cmd-based shortcuts, not Ctrl
