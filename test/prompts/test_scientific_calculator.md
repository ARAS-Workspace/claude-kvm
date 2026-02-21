# Scientific Calculator Task

Complete the following task on the macOS desktop:

## Goal

Switch Calculator to scientific mode, perform a power calculation, and verify the result using OCR.

## Calculation

**2 ^ 10 = 1024**

## Steps

1. Open Calculator — use Spotlight (Cmd+Space), type "Calculator", press Return
2. Switch to Scientific mode — press Cmd+2
3. Use detect_elements to map the scientific button layout
4. Click the buttons: 2, xʸ (power/exponent button), 1, 0, =
5. Use detect_elements to read the result from the display
6. Verify the result is "1024", then call task_complete()

## Rules

- Use detect_elements (not screenshot) to find clickable targets
- The power button may appear as "xʸ", "xy", "x^y" or similar in OCR — find the exponent function
- Click each button individually using the center coordinates from OCR
- Use action_queue to batch actions where possible
- Use key_type for Spotlight search text
- If a button click misses, re-run detect_elements and retry with updated coordinates
- Scientific mode has a dense button layout — rely on OCR coordinates, not guessing
