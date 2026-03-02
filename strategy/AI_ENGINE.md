# Tarati AI Engine

This document explains how the Tarati AI currently works, why it stays responsive at higher difficulty, and which parameters you can tune.

## 1) Core Search Strategy

Tarati uses **minimax** with **alpha-beta pruning**.

- **Minimax** explores future moves as a game tree:
  - maximizing player: BLACK
  - minimizing player: WHITE
- **Alpha-beta pruning** cuts branches that cannot improve the current best line.
- A **transposition table (TT)** stores already-evaluated positions to avoid re-solving identical states reached via different move orders.

This is implemented in:

- Python simulation engine: `strategy/engine/ai.py`
- React app runtime engine: `src/AI.js`

## 2) Evaluation Function

Static evaluation uses:

- material count (regular piece = 1.0, upgraded piece = 1.5)
- upgrade count bonus

Scoring convention:

- Positive score favors WHITE
- Negative score favors BLACK

At terminal states:

- If game over and the side to move has lost, score is converted to `±WINNING_SCORE` for clear win/loss priority.

## 3) Why Search Can Explode

At high depths (Hard/Champion), legal move count can spike, producing a large branching factor.

Even with alpha-beta pruning, full-depth search on every root move can still be expensive in tactical midgames.

## 4) Budgeted Search (Main Improvement)

To control worst-case latency, Tarati now supports bounded search with:

- `max_ms` (time budget per AI turn)
- `max_nodes` (node expansion budget)
- `root_probe_nodes` (how many nodes to spend per root move before rotating)

### Root Round-Robin Probing

Instead of deeply finishing root move #1 before trying others, the engine:

1. Probes each root candidate with a small node slice
2. Rotates to the next root move
3. Repeats with deeper passes while budget remains

This gives an **anytime behavior**:

- If budget is reached early, AI still returns the best move found so far.
- If enough budget remains, deeper search naturally emerges.

## 5) Stochastic Top-K Selection

To keep games less repetitive while staying strong:

- Root candidates are scored and ordered.
- AI can sample from top-k using softmax-style weighting (`stochastic_top_k`).

If randomness is disabled, AI picks the deterministic best line.

## 6) Difficulty Profiles

Default React-side profiles live in:

- `src/config/aiConfig.js`

Current shape per difficulty:

```js
{
  depth: 12,
  maxMs: 70,
  maxNodes: 25000,
  rootProbeNodes: 50,
  stochasticTopK: 3
}
```

Notebook simulation config is also exposed in:

- `strategy/01_simulate_games.ipynb` (`AI_SEARCH_A`, `AI_SEARCH_B`)

## 7) Key Tunables

- **`depth`**: tactical horizon (higher = stronger, slower).
- **`max_ms` / `maxMs`**: hard latency cap per move.
- **`max_nodes` / `maxNodes`**: cap on expanded search states.
- **`root_probe_nodes` / `rootProbeNodes`**: fairness across top-level candidate moves.
- **`stochastic_top_k` / `stochasticTopK`**: move diversity among top choices.

## 8) Practical Tuning Guidance

- For interactive play:
  - Hard: `max_ms ~ 25-40`
  - Champion: `max_ms ~ 50-90`
- For stronger deterministic analysis:
  - increase `depth`, disable randomization, raise `max_nodes`
- For large simulation throughput:
  - lower `max_ms`, moderate `depth`, keep `root_probe_nodes` around 30-70

## 9) Future Upgrades

Potential next steps:

- iterative deepening with aspiration windows
- Zobrist hashing for faster TT keys
- killer/history heuristics for stronger move ordering
- optional MCTS mode for very high-branching positions

---

Tarati now has a modern, bounded minimax implementation: deep when possible, responsive when necessary.

