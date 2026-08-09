"""Minimax AI with alpha-beta pruning — kept in lockstep with src/AI.js.

The rules-facing API here speaks the dict game-state the React app and the
notebooks use. The search itself runs on the integer bitboards in
``bitboard.py`` and converts only at the boundary, so no object is allocated
per node.

Three search properties are load-bearing, and ``test_search.py`` enforces them:

1. **Terminal scoring depends on whose turn it is, not on material.** A player
   who cannot move has lost, however far ahead they are. The previous version
   used ``score < 0 ? +WIN : -WIN`` — material sign as a proxy for the winner —
   which made the engine structurally unable to see "ahead but jammed", the
   characteristic loss in a game with forward-only movement.

2. **Transposition entries are reused only at the depth they were searched to.**
   See ``_negamax`` for why the conventional ``entry.depth >= depth`` rule
   silently corrupts fixed-depth scores.

3. **Root moves are searched with a full window.** Narrowing alpha/beta across
   sibling root moves turns every root score after the first into a bound,
   which breaks both best-move selection and temperature sampling.

Evaluation is in centipieces: 100 == one piece.
"""

import random
import math
import time

from .board import (
    VERTICES, EDGE_SET, ADJACENCY, HOME_BASES,
    RANK, MAX_RANK, FORWARD, DEAD_POSITIONS, OPPONENT,
    apply_move_to_board,
)
from . import bitboard as bb
from .bitboard import EVAL_WEIGHTS, set_weights  # noqa: F401  (re-exported)

# -- Constants -------------------------------------------------------------

WINNING_SCORE = 1_000_000
MAX_SEARCH_PLY = 256
MATE_THRESHOLD = WINNING_SCORE - MAX_SEARCH_PLY

#: Softmax temperature for stochastic move choice, in centipieces.
#: 25 == a quarter of a piece. The previous implementation softmaxed raw scores
#: whose unit was ~100/piece, so exp(-100) made it a uniform tie-breaker rather
#: than an exploration knob.
DEFAULT_TEMPERATURE = 25.0

# Retained for backwards compatibility with older notebook configs.
ROOT_PROBE_NODES = 50
HARD_MAX_NODES = 15_000
EXPERT_MAX_NODES = 25_000

# Transposition bound flags
_EXACT, _LOWER, _UPPER = 0, 1, 2


class _SearchAborted(Exception):
    """Raised when the node or time budget is exhausted mid-search.

    Unwinding by exception guarantees no partial result reaches the
    transposition table and no truncated score is compared against a complete
    one — the root simply falls back to the last fully completed iteration.
    """


class TranspositionTable:
    """Depth-keyed value cache plus a depth-agnostic move-ordering hint.

    ``values`` is keyed by (position, depth) because a value is only valid at
    the depth it was searched to. ``moves`` is keyed by position alone: a best
    move found at any depth is worth trying first, and using it cannot affect
    correctness because it only reorders the move list. That hint is what makes
    iterative deepening pay for itself.
    """

    __slots__ = ('values', 'moves')

    def __init__(self):
        self.values = {}
        self.moves = {}

    def __len__(self):
        return len(self.values)


# -- Rules API (dict game-state) -------------------------------------------

def is_valid_move(game_state, from_v, to_v):
    """Move validation — implements patent §3."""
    if from_v == to_v:
        return False
    if (from_v, to_v) not in EDGE_SET:
        return False

    checker = game_state['checkers'].get(from_v)
    if not checker:
        return False
    if to_v in game_state['checkers']:
        return False
    if checker['color'] != game_state['currentTurn']:
        return False

    # Roks move in any direction (§3.3); so do cobs on their own home base (§3.2)
    if checker['isUpgraded'] or from_v in HOME_BASES[checker['color']]:
        return True
    return to_v in FORWARD[checker['color']][from_v]


def get_all_possible_moves(game_state):
    """Return [(from_v, to_v), ...] for the current player.

    When no normal move exists this returns the dead-piece promotions of
    patent §6.3, represented as (vertex, vertex).
    """
    return [bb.move_to_vertices(m) for m in bb.gen_moves(*bb.from_state(game_state))]


def apply_move_ai(board_state, from_v, to_v):
    """Apply move and toggle turn."""
    new_state, _, _ = apply_move_to_board(board_state, from_v, to_v)
    new_state['currentTurn'] = OPPONENT[board_state['currentTurn']]
    return new_state


def terminal_loser(game_state, moves=None):
    """Return the colour that has lost, or None if the game is still running.

    Two ways to lose (patent §7.1): every piece on the board belongs to the
    opponent, or the player to move has no legal move (including the dead-piece
    promotion of §6.3).
    """
    loser = bb.terminal_loser(*bb.from_state(game_state))
    if loser is None:
        return None
    return 'WHITE' if loser == bb.WHITE else 'BLACK'


def is_game_over(game_state):
    """Game ends when the player to move has no moves, or one colour is gone."""
    return terminal_loser(game_state) is not None


# -- Draw detection utilities (patent §7.2) --------------------------------

def hash_position(game_state):
    """Deterministic position hash for repetition tracking."""
    return bb.zobrist(*bb.from_state(game_state))


def check_threefold_repetition(position_hashes):
    """Return True if any position has appeared >= 3 times."""
    counts = {}
    for h in position_hashes:
        counts[h] = counts.get(h, 0) + 1
        if counts[h] >= 3:
            return True
    return False


def check_fifty_move_rule(cob_moved_flags):
    """Return True if the last 100 half-moves had no cob movement or promotion."""
    if len(cob_moved_flags) < 100:
        return False
    return not any(cob_moved_flags[-100:])


def evaluate_board(game_state):
    """Static evaluation in centipieces — positive favours WHITE.

    Every term is built either on RANK (antisymmetric under the board's 180°
    automorphism) or on vertex sets that map onto their opposite under it, so
    ``eval(P) == -eval(rotate_and_swap(P))`` holds exactly.
    """
    occ, white, rok, _stm = bb.from_state(game_state)
    return bb.evaluate(occ, white, rok)


# -- Search ----------------------------------------------------------------

def _check_budget(ctx):
    if ctx is None:
        return
    ctx['nodes'] += 1
    if ctx['max_nodes'] is not None and ctx['nodes'] >= ctx['max_nodes']:
        raise _SearchAborted
    # perf_counter is comparatively expensive; sample it rather than call it
    # on every node.
    if ctx['deadline'] is not None and (ctx['nodes'] & 255) == 0:
        if time.perf_counter() >= ctx['deadline']:
            raise _SearchAborted


def _tt_store_value(value, ply):
    """Re-base a mate score to be relative to this node before storing."""
    if value > MATE_THRESHOLD:
        return value + ply
    if value < -MATE_THRESHOLD:
        return value - ply
    return value


def _tt_load_value(value, ply):
    """Re-base a stored mate score to be relative to the current root."""
    if value > MATE_THRESHOLD:
        return value - ply
    if value < -MATE_THRESHOLD:
        return value + ply
    return value


def _search(occ, white, rok, stm, depth, alpha, beta, ply, tt, ctx):
    """Negamax with alpha-beta on bitboards. Returns a side-to-move score.

    Table entries are reused only at **exactly** the depth they were searched
    to. Chess engines conventionally accept any entry of greater-or-equal
    depth, treating the deeper value as strictly better, but that makes the
    result depend on search history: in fixed-depth minimax the depth-8 value
    of a position is a different quantity from its depth-5 value, so a depth-8
    bound licenses no conclusion about a depth-5 window. Reusing it anyway lets
    a bound masquerade as an exact value and the corruption propagates upward —
    which is how a root move here came back scoring -309 against a true -530.

    Matching on exact depth keeps every genuine same-depth transposition (the
    bulk of the benefit) while making the search a pure function of the
    position, which the oracle and the labelling pass both depend on.
    """
    _check_budget(ctx)

    alpha_orig = alpha
    tt_move = -1
    key = None

    if tt is not None:
        key = bb.zobrist(occ, white, rok, stm)
        tt_move = tt.moves.get(key, -1)   # ordering hint, valid at any depth
        entry = tt.values.get((key, depth))
        if entry is not None:
            value = _tt_load_value(entry[0], ply)
            flag = entry[1]
            if flag == _EXACT:
                return value
            if flag == _LOWER:
                if value > alpha:
                    alpha = value
            elif value < beta:
                beta = value
            if alpha >= beta:
                return value

    moves = bb.gen_moves(occ, white, rok, stm)
    if not moves:
        # The side to move cannot move and has therefore lost (§7.1). Scaling
        # by ply prefers the fastest win and the longest resistance.
        return -(WINNING_SCORE - ply)
    black = occ & ~white
    if not black or not white:
        loser = bb.BLACK if not black else bb.WHITE
        return (-(WINNING_SCORE - ply) if loser == stm else WINNING_SCORE - ply)

    if depth <= 0:
        score = bb.evaluate(occ, white, rok)
        return score if stm == bb.WHITE else -score

    if len(moves) > 1:
        moves.sort(key=lambda m: bb.order_score(occ, white, rok, stm, m, tt_move),
                   reverse=True)

    best_score = -math.inf
    best_move = -1
    for move in moves:
        c_occ, c_white, c_rok, c_stm = bb.make_move(occ, white, rok, stm, move)
        score = -_search(c_occ, c_white, c_rok, c_stm,
                         depth - 1, -beta, -alpha, ply + 1, tt, ctx)
        if score > best_score:
            best_score = score
            best_move = move
        if best_score > alpha:
            alpha = best_score
        if alpha >= beta:
            break

    if tt is not None:
        if best_score <= alpha_orig:
            flag = _UPPER
        elif best_score >= beta:
            flag = _LOWER
        else:
            flag = _EXACT
        tt.values[(key, depth)] = (_tt_store_value(best_score, ply), flag)
        if best_move >= 0:
            tt.moves[key] = best_move

    return best_score


def _negamax(game_state, depth, alpha, beta, ply, tt=None, ctx=None, weights=None):
    """Dict-facing wrapper around the bitboard search (used by the tests)."""
    occ, white, rok, stm = bb.from_state(game_state)
    return _search(occ, white, rok, stm, depth, alpha, beta, ply, tt, ctx)


def _root_scores(occ, white, rok, stm, depth, tt, ctx):
    """Score every root move with a full window.

    Full windows cost pruning, but a narrowed window makes every sibling score
    after the first a bound rather than a value — which would corrupt both the
    best-move choice and the temperature sampling below.
    """
    moves = bb.gen_moves(occ, white, rok, stm)
    hint = tt.moves.get(bb.zobrist(occ, white, rok, stm), -1) if tt is not None else -1
    moves.sort(key=lambda m: bb.order_score(occ, white, rok, stm, m, hint),
               reverse=True)

    scored = []
    for move in moves:
        c_occ, c_white, c_rok, c_stm = bb.make_move(occ, white, rok, stm, move)
        score = -_search(c_occ, c_white, c_rok, c_stm,
                         depth - 1, -math.inf, math.inf, 1, tt, ctx)
        scored.append((move, score))

    scored.sort(key=lambda item: item[1], reverse=True)
    return scored


def _sample_move(scored, temperature, top_k, rng):
    """Softmax-sample among the top-k root moves.

    Scores are in centipieces and so is the temperature, so it behaves as an
    actual exploration width: at 25, a move half a piece worse is chosen about
    14% as often as the best one.
    """
    if not scored:
        return None
    best_score = scored[0][1]

    if temperature and temperature > 0 and top_k > 1:
        candidates = scored[:top_k]
        weights = [math.exp((s - best_score) / temperature) for _, s in candidates]
        if sum(weights) > 0:
            return rng.choices([m for m, _ in candidates], weights=weights, k=1)[0]

    return rng.choice([m for m, s in scored if s == best_score])


def search_root(
    occ, white, rok, stm,
    depth=8,
    randomize=True,
    max_nodes=None,
    max_ms=None,
    stochastic_top_k=3,
    temperature=DEFAULT_TEMPERATURE,
    use_tt=True,
    rng=None,
):
    """Bitboard-native search entry point.

    Returns (chosen_move, scored, completed_depth) with moves as packed ints.
    Corpus generation drives this directly rather than going through
    ``get_next_best_move``, which would convert a dict game-state to bitboards
    on every single ply of every game.
    """
    rng = rng or random
    moves = bb.gen_moves(occ, white, rok, stm)
    if not moves:
        return None, [], 0

    if max_nodes is None and max_ms is None:
        ctx = None
    else:
        ctx = {
            'nodes': 0,
            'max_nodes': max_nodes,
            'deadline': None if max_ms is None else time.perf_counter() + max_ms / 1000.0,
        }

    tt = TranspositionTable() if use_tt else None
    completed = None
    completed_depth = 0

    for current_depth in range(1, max(1, depth) + 1):
        try:
            scored = _root_scores(occ, white, rok, stm, current_depth, tt, ctx)
        except _SearchAborted:
            break
        completed = scored
        completed_depth = current_depth
        # A proven forced result cannot be improved by looking further.
        if abs(scored[0][1]) > MATE_THRESHOLD:
            break

    if completed is None:
        # Budget expired before even depth 1 finished — fall back to a static
        # ranking so a legal move is always returned.
        def static(move):
            c_occ, c_white, c_rok, c_stm = bb.make_move(occ, white, rok, stm, move)
            score = bb.evaluate(c_occ, c_white, c_rok)
            return -(score if c_stm == bb.WHITE else -score)
        completed = sorted(((m, static(m)) for m in moves),
                           key=lambda item: item[1], reverse=True)

    if randomize:
        chosen = _sample_move(completed, temperature, stochastic_top_k, rng)
    else:
        chosen = completed[0][0]

    return chosen, completed, completed_depth


def get_next_best_move(
    game_state,
    depth=8,
    is_maximizing=None,
    randomize=True,
    max_nodes=None,
    max_ms=None,
    root_probe_nodes=None,
    stochastic_top_k=3,
    temperature=DEFAULT_TEMPERATURE,
    weights=None,
    use_tt=True,
    rng=None,
):
    """Iterative-deepening search entry point.

    Parameters
    ----------
    game_state    : dict  — board + currentTurn
    depth         : int   — maximum search depth in plies
    is_maximizing : bool  — accepted for backwards compatibility and ignored.
                            Min/max follows ``currentTurn``, the only
                            self-consistent reading; callers that passed a value
                            inconsistent with the side to move previously got a
                            search for the *opponent's* preference.
    randomize     : bool  — sample among near-best moves instead of taking the best
    max_nodes     : int   — node budget; returns the last completed depth
    max_ms        : int   — wall-clock budget in milliseconds
    root_probe_nodes : deprecated, ignored (round-robin root probing is gone)
    stochastic_top_k : int   — how many root moves are sampling candidates
    temperature      : float — softmax width in centipieces; 0 disables sampling
    use_tt        : bool  — enable the transposition table
    rng           : random.Random — per-game stream; defaults to the global one

    Returns
    -------
    dict with 'score' (positive favours WHITE), 'move' as (from, to) vertex
    names, 'depth' (deepest completed iteration) and 'scores' (every root move,
    best first, from the side-to-move's perspective).
    """
    occ, white, rok, stm = bb.from_state(game_state)
    chosen, completed, completed_depth = search_root(
        occ, white, rok, stm,
        depth=depth, randomize=randomize, max_nodes=max_nodes, max_ms=max_ms,
        stochastic_top_k=stochastic_top_k, temperature=temperature,
        use_tt=use_tt, rng=rng,
    )
    if chosen is None:
        return {'score': 0, 'move': None, 'depth': 0, 'scores': []}

    stm_score = dict(completed)[chosen]
    white_score = stm_score if stm == bb.WHITE else -stm_score

    return {
        'score': white_score,
        'move': bb.move_to_vertices(chosen),
        'depth': completed_depth,
        'scores': [(bb.move_to_vertices(m), s) for m, s in completed],
    }
