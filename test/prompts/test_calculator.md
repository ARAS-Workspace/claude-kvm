# Calculator Task

Complete the following task on the macOS desktop:

## Goal

Open Calculator, perform a calculation, and verify the result using OCR.

## Calculation

**42 × 13 = 546**

## Steps

1. Open Calculator — use Spotlight (Cmd+Space), type "Calculator", press Return
2. Wait for the app to open, then use detect_elements to find the buttons
3. Click the buttons: 4, 2, ×, 1, 3, =
4. Use detect_elements to read the result from the display
5. Verify the result is "546", then call task_complete()

## Rules

- Use detect_elements (not screenshot) to find clickable targets
- Click each button individually using the center coordinates from OCR
- Use action_queue to batch actions where possible
- Use key_type for Spotlight search text
- If a button click misses, re-run detect_elements and retry with updated coordinates
