# Simple Chess Game

Complete the following task on the macOS desktop:

## Goal

Open the built-in Chess app, play a short game by moving pieces using click interactions, and verify moves via OCR.

## Steps

1. Open Chess — use Spotlight (Cmd+Space), type "Chess", press Return
2. Wait for the app to open — use wait(2000) then detect_elements to confirm the board is visible
3. Chess may ask to start a new game or show a dialog — if so, accept/start a new game
4. You are playing as White (bottom side). Play the following 4 moves:

### Move 1 — King's Pawn Opening
- Use detect_elements to find the white pawn on e2 (column 5, row 7 from top)
- Click the pawn — green circles will appear showing valid destination squares
- Use detect_elements to identify the valid move circles
- Click the e4 square (two squares forward) to complete the move
- Use wait(2000) for Black's response

### Move 2 — King's Knight
- Use detect_elements to find the board state after Black's move
- Click the white knight on g1 (column 7, row 8 from top)
- Green circles will appear — click the f3 square to move the knight
- Use wait(2000) for Black's response

### Move 3 — King's Bishop
- Use detect_elements to find the board state
- Click the white bishop on f1 (column 6, row 8 from top)
- Green circles will appear — click the c4 square (diagonal to upper-left) to move the bishop
- Use wait(2000) for Black's response

### Move 4 — Queen Attack
- Use detect_elements to find the board state
- Click the white queen on d1 (column 4, row 8 from top)
- Green circles will appear — look for an aggressive square (h5 or f7 if available)
- Click the best available forward square for the queen
- Use wait(2000) for Black's response

5. After completing 4 moves, use detect_elements to capture the final board state
6. Call task_complete()

## How to Move a Piece

Moving a piece is a two-click process — NO dragging required:
1. **First click** — click on the piece you want to move. Green circles will appear on all valid destination squares.
2. **Second click** — click on one of the green circle squares to complete the move. The piece will jump there automatically.

## Rules

- Use detect_elements before every click action — the board changes after each move
- After clicking a piece, use detect_elements to find the green circles (valid destinations), then click the target square
- Do NOT drag pieces — just click source, then click destination
- Use action_queue to batch actions where possible
- Use wait(2000) after each move to let the computer (Black) respond
- If a piece click doesn't show valid moves, re-run detect_elements and retry
- The computer plays Black automatically — just wait for its response