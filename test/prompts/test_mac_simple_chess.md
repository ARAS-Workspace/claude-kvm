# Simple Chess Game

Complete the following task on the macOS desktop:

## Goal

Open the built-in Chess app, play 2 moves as White, then finish.

## How the Chess App Works

Moving a piece is a **two-click** process — NO dragging:
1. **Click on a piece** — white concentric rings appear around its base (selected)
2. **Click on the destination square** — the piece jumps there

After clicking a piece, use `cursor_crop` to verify the **white rings** appeared. If no rings, you missed — retry.

## Setup

1. Open Chess — Spotlight (Cmd+Space), type "Chess", press Return
2. wait(3000), then start a **new game**: Game menu → "New..." → click "Start"
3. wait(2000), then confirm title bar shows "White to Move" without a tilde (~)
4. Edge Notation should already be on (A–H columns, 1–8 rows visible on edges). If not, enable via View → "Edge Notation"
5. detect_elements to read edge labels and build your coordinate map

## Coordinate Map

Use detect_elements to read edge label positions, then calculate square centers:
- **Columns**: A–H labels on bottom edge — use x + width/2 for each label's center
- **Rows**: 1–8 labels on left edge — use y + height/2 for each label's center
- 3D perspective compresses columns toward center on higher rows — shift is small for rows 1–4

## Move 1 — e2 to e4 (King's Pawn)

1. Click the e2 pawn (column E, row 2)
2. cursor_crop to verify white rings — if rings visible, proceed
3. Click e4 (column E, row 4)
4. wait(3000) — Black will respond automatically

## Move 2 — Knight g1 to f3

1. detect_elements to refresh coordinates
2. Click the knight on g1 (column G, row 1)
3. cursor_crop to verify white rings — if rings visible, proceed
4. Click f3 (column F, row 3)
5. wait(3000) — Black will respond automatically

## Finish

Take a screenshot of the final board state, then call task_complete().

## Rules

- Start a NEW game before playing — do not reuse an existing board
- After clicking a piece, ALWAYS cursor_crop to verify white rings before clicking destination
- Do NOT drag pieces — click source, then click destination
- Do NOT use the observer to verify moves — trust cursor_crop and screenshot
- A tilde (~) in the title bar means "Edited" mode — if you see it, press Cmd+Z then Cmd+N to start over
- Use your coordinate map from edge labels, not visual guessing
- Black responds automatically after each white move — just wait(3000)