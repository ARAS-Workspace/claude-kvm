# Simple Chess Game

Complete the following task on the macOS desktop:

## Goal

Open the built-in Chess app and play a short game (4 white moves).

## How the Chess App Works

This is a 3D board. Moving a piece is a **two-click** process:
1. **Click on a piece** — white concentric rings will appear around the base of the piece, confirming it is selected. Valid destination squares will also show subtle highlights.
2. **Click on the destination square** — the piece moves there automatically.

**Important**: The selection indicator is **white rings** around the piece base, NOT green circles. After clicking a piece, use `cursor_crop` centered on the piece to verify the white rings appeared. Do NOT drag pieces.

## Setup

1. Open Chess — use Spotlight (Cmd+Space), type "Chess", press Return
2. Wait for the app — use wait(3000) then screenshot to confirm the board is visible
3. Enable Edge Notation — click View menu, then click "Edge Notation" so column letters (A–H) and row numbers (1–8) appear on the board edges
4. If a "Game Center" dialog or notification appears, dismiss it by pressing Escape
5. Use detect_elements to read the edge labels and map the board grid

## Board Coordinate Strategy

The board is in 3D perspective — column positions shift per row. Use this approach:
- Read the **row numbers** (1–8) on the left edge via detect_elements — their y-coordinates give you each row's vertical center
- Read the **column letters** (A–H) on the bottom edge — their x-coordinates give you column centers at the bottom
- For rows higher up the board, columns compress toward center due to perspective
- After mapping, use `cursor_crop` on a piece to visually confirm you are targeting the right square before clicking

## Moves

Play these 4 moves as White (bottom side):

### Move 1 — e2 to e4
- Find the e2 pawn using your coordinate map (column E, row 2)
- Click it — verify selection with cursor_crop (white rings visible)
- Click the e4 square (column E, row 4) to complete the move
- wait(3000) for Black's response

### Move 2 — Knight g1 to f3
- detect_elements to read updated board
- Click the knight on g1 (column G, row 1) — verify selection with cursor_crop
- Click f3 (column F, row 3)
- wait(3000) for Black's response

### Move 3 — Bishop f1 to c4
- detect_elements to read updated board
- Click the bishop on f1 (column F, row 1) — verify selection with cursor_crop
- Click c4 (column C, row 4)
- wait(3000) for Black's response

### Move 4 — Queen d1 to h5
- detect_elements to read updated board
- Click the queen on d1 (column D, row 1) — verify selection with cursor_crop
- Click h5 (column H, row 5) — if blocked, click the best available forward square
- wait(3000) for Black's response

## Finish

After 4 moves, take a screenshot of the final board state, then call task_complete().

## Rules

- Enable Edge Notation FIRST — do not attempt moves without coordinate labels
- Use detect_elements to read edge labels and map the grid before your first move
- After clicking a piece, ALWAYS use cursor_crop to verify white rings appeared (piece selected)
- If no white rings appear, you clicked the wrong spot — re-check coordinates and retry
- Do NOT drag pieces — click source, then click destination
- Do NOT use screenshot to find pieces — use your coordinate map from edge labels
- Use wait(3000) after each move to let Black respond
- If you accidentally enter "Edited" mode, press Cmd+Z to undo, then Cmd+N for a new game
