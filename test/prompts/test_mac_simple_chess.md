# Simple Chess Game

Complete the following task on the macOS desktop:

## Goal

Open the built-in Chess app, play 2 moves as White, then finish.

## How the Chess App Works

Moving a piece is a **two-click** process — NO dragging:
1. **Click on a piece** — white concentric rings appear around its base (selected)
2. **Click on the destination square** — the piece jumps there

After clicking a piece, use `cursor_crop` to verify the **white rings** appeared. If no rings, you missed — retry.

## Steps

1. Open Chess — Spotlight (Cmd+Space), type "Chess", press Return
2. wait(3000), then screenshot to confirm board is visible
3. Enable Edge Notation — View menu → "Edge Notation" (shows A–H columns and 1–8 rows on board edges)
4. Dismiss any Game Center dialog (press Escape)
5. detect_elements to read edge labels and build your coordinate map

## Coordinate Map

Use detect_elements to read edge label positions, then calculate square centers:
- **Columns**: A–H labels on bottom edge give x-centers
- **Rows**: 1–8 labels on left edge give y-centers
- 3D perspective compresses columns toward center on higher rows

## Move 1 — e2 to e4 (King's Pawn)

1. Click the e2 pawn (column E, row 2)
2. cursor_crop to verify white rings
3. Click e4 (column E, row 4)
4. wait(3000) for Black's response

## Move 2 — Knight g1 to f3

1. detect_elements to refresh coordinates
2. Click the knight on g1 (column G, row 1)
3. cursor_crop to verify white rings
4. Click f3 (column F, row 3)
5. wait(3000) for Black's response

## Finish

Take a screenshot of the final board state, then call task_complete().

## Rules

- Enable Edge Notation FIRST — do not attempt moves without it
- After clicking a piece, ALWAYS cursor_crop to verify white rings
- Do NOT drag pieces — click source, then click destination
- Use your coordinate map from edge labels, not visual guessing
- If you enter "Edited" mode, Cmd+Z to undo, then Cmd+N for new game