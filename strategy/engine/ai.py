"""Minimax AI with alpha-beta pruning — direct port of src/AI.js.

Key additions over the JS version:
  - Per-search transposition table (not a global singleton) for multiprocessing safety.
  - Root-level randomisation among equally-scoring moves (for game diversity).
  - Move limit parameter to prevent infinite games between equal-strength AIs.
"""

import random
import math
import time
from .positions import get_position, POSITION_Y, ensure_positions
from .board import (
    VERTICES, EDGE_SET, ADJACENCY, HOME_BASES,
    apply_move_to_board,
)

# -- Evaluation constants (match JS) --------------------------------------

WINNING_SCORE = 1_000_000
ROOT_PROBE_NODES = 50
HARD_MAX_NODES = 15_000
EXPERT_MAX_NODES = 25_000

# -- Core functions --------------------------------------------------------

def is_valid_move(game_state, from_v, to_v):
    """Exact port of AI.js isValidMove."""
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

    if not checker['isUpgraded']:
        ensure_positions()
        from_y = POSITION_Y[from_v]
        to_y = POSITION_Y[to_v]
        if checker['color'] == 'WHITE' and (from_y - to_y > 10):
            return True
        elif checker['color'] == 'BLACK' and (to_y - from_y > 10):
            return True
        else:
            return False

    return True


def get_all_possible_moves(game_state):
    """Return list of (from_v, to_v) tuples for the current player."""
    moves = []
    for from_v, checker in game_state['checkers'].items():
        if checker['color'] == game_state['currentTurn']:
            for to_v in ADJACENCY[from_v]:
                if is_valid_move(game_state, from_v, to_v):
                    moves.append((from_v, to_v))
    return moves


def apply_move_ai(board_state, from_v, to_v):
    """Apply move and toggle turn (used inside the search tree)."""
    new_state, _, _ = apply_move_to_board(board_state, from_v, to_v)
    new_state['currentTurn'] = 'BLACK' if board_state['currentTurn'] == 'WHITE' else 'WHITE'
    return new_state


def is_game_over(game_state):
    """Game ends when current player has no moves or all pieces are one colour."""
    if not get_all_possible_moves(game_state):
        return True
    colors = set(c['color'] for c in game_state['checkers'].values())
    return len(colors) == 1


def evaluate_board(game_state):
    """Static evaluation — positive favours WHITE (matches JS)."""
    white_pieces = 0.0
    black_pieces = 0.0
    white_upgrades = 0
    black_upgrades = 0

    for checker in game_state['checkers'].values():
        value = 1.5 if checker['isUpgraded'] else 1.0
        if checker['color'] == 'WHITE':
            white_pieces += value
            if checker['isUpgraded']:
                white_upgrades += 1
        else:
            black_pieces += value
            if checker['isUpgraded']:
                black_upgrades += 1

    return (white_pieces - black_pieces) * 97 + (white_upgrades - black_upgrades) * 117


def _quick_evaluate(game_state):
    """Fast eval for move ordering (matches JS quickEvaluate)."""
    score = 0.0
    for checker in game_state['checkers'].values():
        score += 1 if checker['color'] == 'BLACK' else -1
        if checker['isUpgraded']:
            score += 0.5 if checker['color'] == 'BLACK' else -0.5
    return score


def _hash_board(game_state):
    """Deterministic board hash for the transposition table."""
    items = tuple(sorted(
        (k, v['color'], v['isUpgraded'])
        for k, v in game_state['checkers'].items()
    ))
    return hash((items, game_state['currentTurn']))


def _sort_moves(moves, game_state, is_maximizing):
    """Sort moves by quick evaluation for better alpha-beta pruning."""
    def key_fn(move):
        return _quick_evaluate(apply_move_ai(game_state, move[0], move[1]))
    moves.sort(key=key_fn, reverse=is_maximizing)


# -- Minimax with alpha-beta ----------------------------------------------

def _default_max_nodes(depth):
    """Auto node budget for deeper difficulties."""
    if depth >= 12:
        return EXPERT_MAX_NODES
    if depth >= 9:
        return HARD_MAX_NODES
    return None


def _weighted_top_choice(candidates, is_maximizing):
    """Pick stochastically from top candidates using softmax weighting."""
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    direction = 1.0 if is_maximizing else -1.0
    adjusted = [direction * score for _, score in candidates]
    max_adjusted = max(adjusted)
    # Keep exponentials numerically stable by shifting by max.
    weights = [math.exp(a - max_adjusted) for a in adjusted]
    return random.choices(candidates, weights=weights, k=1)[0]


def _is_budget_exhausted(search_ctx):
    """Return True when node/time/probe budgets are exhausted."""
    if search_ctx is None:
        return False

    max_nodes = search_ctx['max_nodes']
    probe_limit = search_ctx['probe_limit']
    deadline = search_ctx['deadline']

    if max_nodes is not None and search_ctx['nodes'] >= max_nodes:
        return True
    if probe_limit is not None and search_ctx['nodes'] >= probe_limit:
        return True
    if deadline is not None and time.perf_counter() >= deadline:
        return True
    return False


def _minimax(game_state, depth, is_maximizing, alpha, beta, tt, search_ctx=None):
    """Internal minimax search — not called directly."""
    if search_ctx is not None:
        if _is_budget_exhausted(search_ctx):
            return {'score': evaluate_board(game_state), 'move': None, 'cutoff': True}
        search_ctx['nodes'] += 1

    board_hash = _hash_board(game_state)
    cached = tt.get(board_hash)
    if cached is not None and cached['depth'] >= depth:
        return {'score': cached['result']['score'], 'move': cached['result']['move'], 'cutoff': False}

    game_over = is_game_over(game_state)

    if depth == 0 or game_over:
        score = evaluate_board(game_state)
        if game_over:
            result_score = WINNING_SCORE if score < 0 else -WINNING_SCORE
        else:
            result_score = score
        return {'score': result_score, 'move': None, 'cutoff': False}

    best_move = None
    best_score = float('-inf') if is_maximizing else float('inf')
    cutoff = False

    possible_moves = get_all_possible_moves(game_state)
    _sort_moves(possible_moves, game_state, is_maximizing)

    for move in possible_moves:
        if _is_budget_exhausted(search_ctx):
            cutoff = True
            break

        new_state = apply_move_ai(game_state, move[0], move[1])
        result = _minimax(new_state, depth - 1, not is_maximizing, alpha, beta, tt, search_ctx)
        score = result['score']
        cutoff = cutoff or result.get('cutoff', False)

        if is_maximizing:
            if score > best_score:
                best_score = score
                best_move = move
            alpha = max(alpha, best_score)
        else:
            if score < best_score:
                best_score = score
                best_move = move
            beta = min(beta, best_score)

        if beta <= alpha:
            break

    if best_move is None:
        # Budget may have expired before exploring children.
        return {'score': evaluate_board(game_state), 'move': None, 'cutoff': True}

    result = {'score': best_score, 'move': best_move, 'cutoff': cutoff}
    if not cutoff:
        tt[board_hash] = {'depth': depth, 'result': {'score': best_score, 'move': best_move}}
    return result


def get_next_best_move(
    game_state,
    depth=8,
    is_maximizing=True,
    randomize=True,
    max_nodes=None,
    max_ms=None,
    root_probe_nodes=ROOT_PROBE_NODES,
    stochastic_top_k=3,
):
    """Top-level search entry point.

    Parameters
    ----------
    game_state : dict   — current board + currentTurn
    depth      : int    — search depth (3=Easy, 6=Medium, 9=Hard, 12=Champion)
    is_maximizing : bool — True when the AI is BLACK (matches JS convention)
    randomize  : bool   — pick randomly among moves with the same best score

    Returns
    -------
    dict with keys 'score' and 'move' (tuple or None).
    """
    tt = {}  # fresh transposition table per search call

    possible_moves = get_all_possible_moves(game_state)
    if not possible_moves:
        return {'score': 0, 'move': None}

    _sort_moves(possible_moves, game_state, is_maximizing)

    if max_nodes is None:
        max_nodes = _default_max_nodes(depth)

    # Unlimited search keeps original behavior.
    if max_nodes is None and max_ms is None:
        alpha = float('-inf')
        beta = float('inf')
        scored_moves = []

        for move in possible_moves:
            new_state = apply_move_ai(game_state, move[0], move[1])
            result = _minimax(new_state, depth - 1, not is_maximizing, alpha, beta, tt)
            scored_moves.append((move, result['score']))

            # Tighten bounds for deeper subtrees (but don't skip root moves)
            if is_maximizing:
                alpha = max(alpha, result['score'])
            else:
                beta = min(beta, result['score'])

        if is_maximizing:
            best_score = max(s for _, s in scored_moves)
        else:
            best_score = min(s for _, s in scored_moves)

        best_moves = [m for m, s in scored_moves if s == best_score]
        chosen = random.choice(best_moves) if randomize else best_moves[0]
        return {'score': best_score, 'move': chosen}

    # Budgeted root round-robin search:
    # explore each root move in slices before going deeper.
    deadline = None
    if max_ms is not None:
        deadline = time.perf_counter() + max(max_ms, 0) / 1000.0

    search_ctx = {'nodes': 0, 'max_nodes': max_nodes, 'probe_limit': None, 'deadline': deadline}
    move_stats = {
        move: {'score': evaluate_board(apply_move_ai(game_state, move[0], move[1])), 'depth': 0, 'cutoff': False}
        for move in possible_moves
    }

    for current_depth in range(1, depth + 1):
        for move in possible_moves:
            if _is_budget_exhausted(search_ctx):
                break

            if max_nodes is None:
                probe_budget = root_probe_nodes
            else:
                remaining = max_nodes - search_ctx['nodes']
                probe_budget = min(root_probe_nodes, remaining)
            search_ctx['probe_limit'] = search_ctx['nodes'] + probe_budget

            new_state = apply_move_ai(game_state, move[0], move[1])
            result = _minimax(
                new_state,
                current_depth - 1,
                not is_maximizing,
                float('-inf'),
                float('inf'),
                tt,
                search_ctx,
            )

            move_stats[move] = {
                'score': result['score'],
                'depth': current_depth,
                'cutoff': result.get('cutoff', False),
            }

        search_ctx['probe_limit'] = None
        if _is_budget_exhausted(search_ctx):
            break

    best_depth = max(stats['depth'] for stats in move_stats.values())
    depth_candidates = [(move, stats['score']) for move, stats in move_stats.items() if stats['depth'] == best_depth]

    ordered = sorted(depth_candidates, key=lambda item: item[1], reverse=is_maximizing)
    best_score = ordered[0][1]

    if randomize:
        if len(ordered) > 1 and stochastic_top_k > 1:
            top_candidates = ordered[:stochastic_top_k]
            chosen_move, _ = _weighted_top_choice(top_candidates, is_maximizing)
        else:
            best_moves = [m for m, s in ordered if s == best_score]
            chosen_move = random.choice(best_moves)
    else:
        chosen_move = ordered[0][0]

    return {'score': best_score, 'move': chosen_move}
