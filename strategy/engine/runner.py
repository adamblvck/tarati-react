"""Game runner — importable module so ProcessPoolExecutor can pickle it.

Functions defined in Jupyter cells live in a fake __main__ that child
processes can't resolve on macOS (spawn start method). Keeping them
here makes multiprocessing work cleanly.
"""

import time
import json
import random

from .board import initial_game_state, apply_move_to_board
from .ai import get_next_best_move, is_game_over, get_all_possible_moves


def play_one_game(
    white_depth,
    black_depth,
    max_moves=200,
    seed=None,
    white_ai_kwargs=None,
    black_ai_kwargs=None,
    random_first_move=False,
    skip_board_after=False,
):
    """Play a single AI-vs-AI game and return (game_record, move_records).

    Parameters
    ----------
    white_depth : int — minimax depth for WHITE
    black_depth : int — minimax depth for BLACK
    max_moves   : int — half-move limit (prevents infinite loops)
    seed              : int  — random seed for reproducibility (None = non-deterministic)
    random_first_move : bool — if True, move 1 is sampled uniformly from legal moves
    skip_board_after  : bool — if True, omit board_after JSON from move records
                               (saves ~80% IPC and storage for large batch runs)
    """
    if seed is not None:
        random.seed(seed)

    white_ai_kwargs = dict(white_ai_kwargs or {})
    black_ai_kwargs = dict(black_ai_kwargs or {})

    state = initial_game_state()
    move_records = []
    move_number = 0
    t0 = time.perf_counter()

    while not is_game_over(state) and move_number < max_moves:
        color = state['currentTurn']
        depth = white_depth if color == 'WHITE' else black_depth
        # BLACK is the maximising player in the JS convention
        is_max = (color == 'BLACK')

        if random_first_move and move_number == 0:
            legal_moves = get_all_possible_moves(state)
            if not legal_moves:
                break
            from_v, to_v = random.choice(legal_moves)
        else:
            ai_kwargs = black_ai_kwargs if color == 'BLACK' else white_ai_kwargs
            result = get_next_best_move(
                state,
                depth=depth,
                is_maximizing=is_max,
                randomize=True,
                **ai_kwargs,
            )
            if result['move'] is None:
                break
            from_v, to_v = result['move']

        # Apply move (with detailed tracking for recording)
        new_board, strikes, upgrades = apply_move_to_board(state, from_v, to_v)
        new_board['currentTurn'] = 'BLACK' if color == 'WHITE' else 'WHITE'

        move_number += 1
        move_records.append({
            'move_number': move_number,
            'color': color,
            'from_vertex': from_v,
            'to_vertex': to_v,
            'strikes': json.dumps(strikes),
            'upgrades': json.dumps(upgrades),
            'board_after': None if skip_board_after else json.dumps(new_board['checkers']),
        })

        state = new_board

    duration_ms = (time.perf_counter() - t0) * 1000

    # Determine winner and termination reason
    if move_number >= max_moves:
        winner = 'DRAW'
        termination = 'move_limit'
    else:
        colors = set(c['color'] for c in state['checkers'].values())
        if len(colors) == 1:
            winner = list(colors)[0]
            termination = 'total_conversion'
        else:
            # No legal moves — the player who CAN'T move loses
            loser = state['currentTurn']
            winner = 'BLACK' if loser == 'WHITE' else 'WHITE'
            termination = 'no_legal_moves'

    game_record = {
        'white_depth': white_depth,
        'black_depth': black_depth,
        'winner': winner,
        'total_moves': move_number,
        'termination': termination,
        'duration_ms': duration_ms,
    }

    return game_record, move_records


def worker(args):
    """Top-level worker for ProcessPoolExecutor (must be importable for pickling)."""
    # Backward compatible with old task tuple shapes:
    #   4-tuple: (white_depth, black_depth, max_moves, seed)
    #   6-tuple: + (white_ai_kwargs, black_ai_kwargs)
    #   7-tuple: + (random_first_move,)
    #   8-tuple: + (skip_board_after,)
    n = len(args)

    white_depth, black_depth, max_moves, seed = args[:4]
    white_ai_kwargs = args[4] if n > 4 else None
    black_ai_kwargs = args[5] if n > 5 else None
    random_first_move = args[6] if n > 6 else False
    skip_board_after = args[7] if n > 7 else False

    return play_one_game(
        white_depth,
        black_depth,
        max_moves,
        seed,
        white_ai_kwargs=white_ai_kwargs,
        black_ai_kwargs=black_ai_kwargs,
        random_first_move=random_first_move,
        skip_board_after=skip_board_after,
    )
