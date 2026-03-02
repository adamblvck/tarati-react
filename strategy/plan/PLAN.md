# Tarati Strategy Mining Plan

## Goal

Run 100,000 AI vs AI games (Hard vs Champion), record every move, then analyse the corpus to extract openings, mid-game tactics, late-game patterns, and compile them into a human-readable **Tarati Strategy Book** with agentic naming.

---

## Phase 0 — Game Engine Port (Python)

Before anything runs, we need a **pure-Python Tarati engine** that is
byte-for-byte consistent with the React app. No shortcuts — the plan is to
translate the three source-of-truth files directly:

| React file | Python module | What it covers |
|---|---|---|
| `src/GameBoard.js` | `engine/board.py` | Vertices (23), edges (42), home-bases, `apply_move_to_board()` |
| `src/AI.js` | `engine/ai.py` | `is_valid_move()`, `get_all_possible_moves()`, `apply_move_ai()`, `is_game_over()`, evaluation, minimax w/ alpha-beta |
| `src/helpers/position.js` | `engine/positions.py` | `get_position()` — needed only for the forward-direction check in `is_valid_move` |

### Key translation notes

- **Board state** is a plain dict: `{ "checkers": { "C1": {"color":"WHITE","isUpgraded":False}, ... }, "currentTurn": "WHITE" }`.
- **Forward-only rule**: Non-upgraded WHITE pawns must decrease Y; non-upgraded BLACK pawns must increase Y. The Y values come from `get_position()` using the same trig (width=250, height=500, vWidth=250).
- **Striking**: When a pawn lands on vertex `to`, every adjacent opponent pawn flips to the mover's colour and keeps its upgrade status.
- **Upgrading**: Landing on opponent's home-base upgrades the mover. A struck pawn that sits on its *own* home-base also upgrades (e.g. WHITE pawn struck onto C7/C8/D3/D4 upgrades).
- **Game over**: (a) current player has zero legal moves, or (b) all 8 pieces are the same colour.

### Validation step

Write a small test suite (`engine/test_engine.py`) that replays known
board positions and asserts outcomes match the React app. At minimum:

1. Initial state → WHITE has N legal moves, BLACK has 0 (it's not their turn, but verify move gen for BLACK).
2. A strike that flips 2 adjacent pieces simultaneously.
3. Upgrade on opponent home-base.
4. Game-over by total conversion.
5. Game-over by no legal moves.

---

## Phase 1 — Simulation Notebook (`01_simulate_games.ipynb`)

### 1.1 Structure

```
strategy/
├── plan/
│   └── PLAN.md              ← this file
├── engine/
│   ├── __init__.py
│   ├── board.py
│   ├── ai.py
│   └── positions.py
├── data/                     ← generated game records
│   └── games.sqlite          ← or games.parquet
├── 01_simulate_games.ipynb
├── 02_analyse_games.ipynb
└── 03_strategy_book.md       ← final output
```

### 1.2 Database schema (SQLite)

**`games` table**

| Column | Type | Description |
|---|---|---|
| `game_id` | INTEGER PK | Auto-increment |
| `white_depth` | INTEGER | Minimax depth for WHITE |
| `black_depth` | INTEGER | Minimax depth for BLACK |
| `winner` | TEXT | `WHITE` / `BLACK` / `DRAW` |
| `total_moves` | INTEGER | Number of half-moves |
| `termination` | TEXT | `no_legal_moves` / `total_conversion` |
| `duration_ms` | REAL | Wall-clock time for the game |
| `created_at` | TIMESTAMP | When the game was recorded |

**`moves` table**

| Column | Type | Description |
|---|---|---|
| `move_id` | INTEGER PK | Auto-increment |
| `game_id` | INTEGER FK | References `games.game_id` |
| `move_number` | INTEGER | 1-indexed half-move number |
| `color` | TEXT | `WHITE` / `BLACK` |
| `from_vertex` | TEXT | e.g. `C1` |
| `to_vertex` | TEXT | e.g. `B1` |
| `strikes` | TEXT (JSON) | List of vertices whose pieces were flipped |
| `upgrades` | TEXT (JSON) | List of vertices whose pieces were upgraded |
| `board_after` | TEXT (JSON) | Full board state after move |

### 1.3 Match configurations

We run **Hard (depth 9) vs Champion (depth 12)** in two pairings to eliminate first-move advantage bias:

| Pairing | WHITE | BLACK | Games |
|---|---|---|---|
| A | Hard (9) | Champion (12) | 50,000 |
| B | Champion (12) | Hard (9) | 50,000 |

**Testing mode**: Set `N_GAMES = 10` (5 per pairing) to validate the pipeline end-to-end before the full run.

### 1.4 Performance considerations

- **Depth 12 minimax is slow in pure Python.** Expect ~2-10 seconds per move with alpha-beta pruning and a transposition table. A single game might take 1-5 minutes.
- **100,000 games ≈ 70-350 days single-threaded.** This is not viable without optimisation.

#### Speed strategy (pick one or combine)

1. **`multiprocessing`** — Run games in parallel across all CPU cores. Each game is independent. With 8-12 cores, this cuts wall-time by 8-12×.
2. **Cython / Numba** — JIT-compile the hot path (minimax + eval). Can give 10-50× speedup.
3. **Reduce Champion depth for bulk runs** — Use depth 9 vs depth 9 for the 100k run, and depth 9 vs depth 12 for a smaller validation set (1,000 games). The strategy patterns at depth 9 are already strong.
4. **C extension** — Port the engine to C and call via ctypes. Maximum speed, more work.

**Recommendation**: Start with `multiprocessing` + transposition table (already in the JS). If still too slow, drop to depth 9 vs 9 for bulk, and 9 vs 12 for 1,000 validation games. The notebook should make this configurable.

### 1.5 Notebook cells outline

1. **Imports & config** — N_GAMES, depths, DB path, num_workers
2. **Engine smoke test** — Run 1 game, print moves, verify game-over
3. **`play_one_game(white_depth, black_depth)` function** — Returns game record dict + list of move dicts
4. **Parallel runner** — `multiprocessing.Pool` or `concurrent.futures.ProcessPoolExecutor`
5. **Progress bar** — `tqdm` with ETA
6. **Write to SQLite** — Batch insert every 100 games
7. **Summary stats** — Win rates, avg game length, avg duration

---

## Phase 2 — Analysis Notebook (`02_analyse_games.ipynb`)

### 2.1 Game phase definitions

| Phase | Move range | Rationale |
|---|---|---|
| **Opening** | Moves 1–6 | First 3 moves per side. Pieces leave home, initial contact. |
| **Mid-game** | Moves 7–16 | Core striking and positioning. Upgrades typically happen here. |
| **Late-game** | Move 17+ | Few pieces left un-converted, endgame manoeuvring. |

These boundaries are approximate. The notebook should also compute them
dynamically based on the "first strike" and "last upgrade" events per game.

### 2.2 Opening analysis

- **Opening sequences**: Extract the first 3 WHITE + 3 BLACK moves as a tuple. Count frequency of each unique opening.
- **Opening tree**: Build a trie of opening moves. Prune branches with < 0.1% frequency.
- **Win rate by opening**: For each opening sequence, compute WHITE win%, BLACK win%, avg game length.
- **Name openings**: The top 20 openings get human-readable names (see Phase 3).

### 2.3 Mid-game strategy analysis

- **Strike frequency map**: For each vertex, how often is it the target of a strike? Heatmap over the board.
- **Strike chains**: Moves that flip 2+ pieces simultaneously. Frequency and board positions.
- **Upgrade timing**: Distribution of when (move number) upgrades happen. Correlation with winning.
- **Positional control**: Which vertices are most occupied by the eventual winner at move 10? At move 14?
- **Tempo analysis**: Sequences where one player makes 3+ consecutive strikes.

### 2.4 Late-game strategy analysis

- **Conversion patterns**: How do the last 4-6 moves typically play out? Cluster them.
- **Upgraded piece dominance**: Win rate when a player has 2+ upgraded pieces vs opponent with 0.
- **Stalemate traps**: Positions where a player has pieces but no legal moves. How do they arise?
- **Comeback frequency**: Games where a player was down to 1-2 pieces of their colour but won.

### 2.5 Tactical move classification

Tag each move in the database with one or more tactical labels:

| Tag | Condition |
|---|---|
| `strike_single` | Flips exactly 1 opponent piece |
| `strike_double` | Flips exactly 2 opponent pieces |
| `strike_triple` | Flips 3+ opponent pieces |
| `upgrade_move` | Mover upgrades on this move |
| `upgrade_strike` | A struck piece upgrades (lands on its new home-base) |
| `sacrifice` | Mover moves to a position where they'll likely be struck next turn |
| `fork` | After the move, mover threatens 2+ strikes next turn |
| `block` | Move prevents opponent from reaching a key vertex |
| `centre_control` | Move to A1 or B-ring vertex |
| `home_invasion` | Move into opponent's home-base zone |

### 2.6 Notebook cells outline

1. **Load data** from SQLite
2. **Phase segmentation** — tag each move with its phase
3. **Opening analysis** — frequency, win-rate, trie
4. **Mid-game analysis** — strike heatmaps, upgrade timing, positional control
5. **Late-game analysis** — conversion patterns, comebacks, stalemates
6. **Tactical tagging** — apply labels to every move
7. **Export enriched data** — Write tagged moves back to SQLite or to a new `analysis.sqlite`
8. **Visualisations** — Board heatmaps (matplotlib), bar charts, histograms

---

## Phase 3 — Strategy Book Compilation

### 3.1 Agentic naming

Use an LLM (or rule-based heuristic) to name strategies:

- **Openings**: Named after the path shape or the key vertex. Examples:
  - "The Centre Rush" — both players race for A1
  - "The Flank Sweep" — White opens C1→B1, C2→C3
  - "The Citadel" — player keeps pieces near home-base
  - "The Pincer" — converging approach from both sides

- **Mid-game tactics**: Named after the effect:
  - "Double Strike" — flip 2 pieces in one move
  - "The Upgrade Run" — sequence targeting opponent home-base for upgrade
  - "The Colour Wave" — 3+ consecutive strikes

- **Late-game patterns**: Named after the endgame type:
  - "The Stranglehold" — opponent has pieces but no legal moves
  - "The Comeback" — recover from 1-piece disadvantage
  - "Total Domination" — convert all 8 pieces

### 3.2 Strategy book structure (`03_strategy_book.md`)

```markdown
# The Tarati Strategy Book
## Compiled from 100,000 AI Games (Hard vs Champion)

### Part I — Openings
#### 1. The Centre Rush (32% frequency, 54% WHITE win rate)
- Moves: C2→B1, C8→B4, C1→C12, ...
- Why it works: ...
- Counter: ...

#### 2. The Flank Sweep (18% frequency, 61% BLACK win rate)
...

### Part II — Mid-Game Tactics
#### 1. Double Strike
- Frequency: occurs in 45% of games
- Key positions: [board diagram]
- How to set it up: ...

### Part III — Late-Game Patterns
#### 1. The Stranglehold
...

### Part IV — Statistical Summary
- Overall win rates
- Average game length
- Most decisive openings
- Most common tactical patterns

### Appendix — Glossary of Tarati Terms
```

### 3.3 Board diagrams

Generate ASCII or SVG board diagrams for key positions. The board is a
concentric hex structure, so a simplified ASCII layout:

```
        D3 ── D4
       /        \
    C7 ── C8 ── C9
   / |    |    | \
 C6  B4 ─ B5  B5  C10
  |  |  \ | /  |   |
 C5  B3 ─ A1 ─ B6  C11
  \  |  / | \  |   /
   C4  B2 ─ B1  C12
    \  |    |  /
     C3 ── C2 ── C1
              \  /
          D2 ── D1
```

(Approximate — the actual layout is a hex with home-base spurs.)

---

## Phase 4 — Execution Timeline

| Step | Task | Time estimate |
|---|---|---|
| 0.1 | Port `board.py` | 1 hour |
| 0.2 | Port `positions.py` | 30 min |
| 0.3 | Port `ai.py` | 2 hours |
| 0.4 | Write `test_engine.py` | 1 hour |
| 1.1 | Build simulation notebook | 2 hours |
| 1.2 | Test run (10 games) | 15 min |
| 1.3 | Full run (100k games) | 12-48 hours (parallel) |
| 2.1 | Build analysis notebook | 4 hours |
| 2.2 | Run analysis | 30 min |
| 3.1 | Generate strategy book | 2 hours |

**Total active work**: ~13 hours
**Total compute time**: 12-48 hours (background, parallelised)

---

## Dependencies

```
# strategy/requirements.txt
numpy
pandas
matplotlib
seaborn
tqdm
jupyter
ipykernel
```

No external game engines. No ML libraries (yet). Pure Python engine + standard data science stack.

---

## File Inventory (what we'll create)

```
strategy/
├── plan/
│   └── PLAN.md                    ← THIS FILE
├── engine/
│   ├── __init__.py
│   ├── board.py                   ← Board topology, apply_move_to_board
│   ├── ai.py                      ← Minimax, evaluation, move validation
│   ├── positions.py               ← Vertex coordinates (for forward-check)
│   └── test_engine.py             ← Validation tests
├── data/
│   └── games.sqlite               ← Game records (generated)
├── 01_simulate_games.ipynb        ← Run AI vs AI matches
├── 02_analyse_games.ipynb         ← Extract strategies
├── 03_strategy_book.md            ← Final compiled strategy book
└── requirements.txt
```

---

## Open Questions / Decisions Needed

1. **Depth trade-off**: Do we run all 100k at depth 9 vs 12, or do a hybrid (bulk at 9v9, sample at 9v12)? The plan assumes configurable — test first, decide based on speed.

2. **Agentic naming**: Should we use an LLM API call to name openings, or hand-craft rules? The plan supports both — the analysis notebook exports the raw data, and a separate step (or notebook cell) does the naming.

3. **Randomness**: The minimax is deterministic. Two games with the same config will produce the same result. We need to add **move randomisation** for equivalent-scoring moves (pick randomly among moves with the same best score). This is critical for generating diverse games.

4. **Draw handling**: The current engine has no draw detection (no repetition or move limit). We should add a **move limit** (e.g., 200 half-moves) to prevent infinite games between equal-strength AIs.
