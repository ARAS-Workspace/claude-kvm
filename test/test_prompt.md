# File Manager Task

Complete the following task on the XFCE desktop (1280x720):

## Goal

Open the File Manager, create a directory structure, and verify the result.

## Steps

1. Open the File Manager (Thunar) — double-click the "Home" icon on the desktop or find it in the taskbar
2. Create a new folder named "claude-kvm-test" — right-click empty area → Create Folder
3. Open "claude-kvm-test"
4. Inside it, create another folder named "logs"
5. Verify both folders exist, then call task_complete()

## Rules

- Use detect_elements to find menu items and file/folder names before clicking
- Use action_queue to batch actions
- Use verify() after key steps
