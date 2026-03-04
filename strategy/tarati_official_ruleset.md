# Tarati — Official Ruleset

> Compiled from: **WO 89/02772** — *Apparatus for Playing a Board Game*
> Filed by **George Spencer-Brown**, 21 September 1988
> International Publication Date: 6 April 1989

This document covers the **"First Game"** described in the patent (the two-player game
that Tarati is based on). The patent also describes a "Second Game" and a six-player
variant, which are not covered here.

---

## 1. Equipment

### 1.1 The Board
- Two **home-bases** at opposite ends, each consisting of **4 stopping points** joined
  by **4 pathways** in a square formation.
- Between the home-bases: a network of **34 interconnecting pathways** forming
  **15 further stopping points** at intersections.
- The central region forms a **regular hexagon** with opposite corners joined
  (equilateral triangles). An outer square on each side of the hexagon, with further
  lines completing a **regular dodecagon**.
- All lines are of **equal length** — stopping points are equally spaced from all
  adjacent stopping points.
- **Total: 23 stopping points, 42 pathways.**

### 1.2 Pieces
- **8 reversible "cob" (common) pieces** — disc-shaped tokens, one face light
  (White), one face dark (Black).
- **8 reversible "rok" (royal) pieces** — identical to cobs except for a
  **contrasting central mark** (spot or emblem) on each face, distinguishing them
  from cobs.
- "White" = light-coloured side facing upwards.
- "Black" = dark-coloured side facing upwards.

### 1.3 Terminology
| Term | Meaning |
|------|---------|
| **Cob** | A common piece (forward-only movement) |
| **Rok** | A royal piece (moves in any direction) |
| **Adjacent** | Two stopping points linked by a single line |
| **Non-adjacent** | Stopping points separated by two or more lines |
| **Home-base line** | Imaginary extension of the line between the outermost stopping points at each end |
| **Dead** | A cob that cannot legally be advanced (see §7) |

---

## 2. Setup

- Place a **White cob** on each of the 4 stopping points of one home-base.
- Place a **Black cob** on each of the 4 stopping points of the other home-base.
- **White moves first.**
- Players alternate turns.

---

## 3. Movement

- On each turn, a player advances **one piece** from its current stopping point
  along **a single line** to an **adjacent stopping point**.
- **No piece** may move to a stopping point already occupied by another piece
  (no stacking).

### 3.1 Cob Movement (Forward-Only)
- A cob can **only be moved to a point nearer the opponent's home-base line**
  (i.e., forward toward the opponent's side).

### 3.2 Home-Base Exception
- **When a cob begins its move on one of its own home-base stopping points**,
  it may be moved **in any direction** (not just forward) to effect a capture.

### 3.3 Rok Movement (Any Direction)
- A rok may move **in any direction** along the lines — forward, backward,
  or sideways.

---

## 4. Capture (Striking)

- When a piece is moved from a **non-adjacent** stopping point to a stopping point
  **adjacent to an opponent's piece**, it **captures** that opponent's piece.
- The captured piece **remains** on its stopping point but is **turned over**
  (flipped) to show the opposite colour. It now belongs to the capturing player.
- **Multiple captures**: A single move can capture more than one opponent's piece
  (every adjacent opponent at the destination is captured).

### 4.1 The Pre-Adjacency Rule (Critical)
> **No piece may be captured by a piece which was adjacent to it before the move.**

This means: if piece A starts on point X, and opponent piece B is on point Y, and
X is adjacent to Y — then even if A moves to point Z (also adjacent to Y), piece B
is **not** captured. The capturing piece must have come from a non-adjacent position
relative to the captured piece.

---

## 5. Promotion (Cob → Rok)

### 5.1 Standard Promotion
- A cob is **promoted to a rok** when it is **advanced onto** one of the opponent's
  home-base stopping points.
- The cob is removed from the board and replaced by a rok of the same colour.

### 5.2 Capture on Own Home-Base (Exception)
- A cob that is **captured while sitting on its own home-base** is **not**
  immediately promoted.
- It simply becomes a cob of the opponent's colour (flipped).
- It is promoted to a rok only if it is **later advanced** (moved forward).

### 5.3 Permanent Status
- Once a piece is a rok, it retains rok status even if later captured/flipped.
  (The patent uses physical piece replacement, so a rok piece keeps its
  distinguishing mark regardless of which colour faces up.)

---

## 6. Dead Pieces

### 6.1 Definition
- A cob on one of the **opponent's two outermost home-base stopping points**
  (the D-positions) that cannot be advanced further is **"dead"**.
- A cob whose **only legal path is blocked by a dead piece** is also dead.

### 6.2 What Is NOT Dead
- A **rok** can never be dead (it moves in any direction).
- A cob blocked by a cob of the **opposite colour**, or by a **live cob** of the
  same colour, or by a **rok of either colour**, is **not dead** (because any of
  those blocking pieces might move away).

### 6.3 Forced Promotion of Dead Pieces
- If a player **cannot move any pieces** but possesses one or more dead pieces,
  they may **promote one dead piece to a rok** (if doing so permits it to be moved).

### 6.4 Sole Remaining Piece
- If a player has a cob that is the **sole remaining piece of its colour**,
  that cob **must be promoted to a rok** regardless of its position.

---

## 7. Game End

### 7.1 Win Conditions
A player **wins** if:
1. The opponent **cannot legally move** any of their pieces.
2. The opponent **resigns** or abandons the game.
3. (With time controls) The opponent **fails to complete** the required number
   of moves within the time limit.

### 7.2 Draw Conditions
The game is **drawn** if:
1. Both players **agree** to a draw.
2. **50-move rule**: If moves have been recorded and a player can prove that at
   least **50 consecutive moves** (by each player) have been played without
   moving or promoting a cob. (This draw cannot be claimed if the claimant
   has already won or can win at the next opportunity.)
3. **Threefold repetition**: A player correctly announces that at the completion
   of their next intended move, the resulting position will have occurred at
   least **three times** (same piece ranks, colours, and positions, with the same
   player to move).

---

## 8. Board Vertex Notation (Digital Mapping)

For the digital implementation, stopping points are labeled:

| Ring | Vertices | Count |
|------|----------|-------|
| **A** (Center) | A1 | 1 |
| **B** (Boundary hexagon) | B1–B6 | 6 |
| **C** (Circumference dodecagon) | C1–C12 | 12 |
| **D** (Domestic / Home-base) | D1–D4 | 4 |
| **Total** | | **23** |

### Home-Base Assignments
- **White home-base**: D1, D2, C1, C2 (bottom of board)
- **Black home-base**: D3, D4, C7, C8 (top of board)
- **Outermost home-base points** (where dead pieces can occur): D1, D2 (White), D3, D4 (Black)
