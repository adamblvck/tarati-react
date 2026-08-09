"""Game runner — importable module so ProcessPoolExecutor can pickle it.

Functions defined in Jupyter cells live in a fake __main__ that child
processes can't resolve on macOS (spawn start method). Keeping them
here makes multiprocessing work cleanly.

Termination codes are deliberately distinct: ``move_limit`` means the game was
cut off unresolved, whereas ``threefold`` and ``fifty_move`` are real draws
under patent §7.2. The previous version recorded every cut-off as a DRAW, which
made the draw statistics meaningless.
"""

import time
import json
import random

from .board import initial_game_state, apply_move_to_board, OPPONENT
from . import bitboard as bb
from .ai import (
    get_next_best_move, is_game_over, get_all_possible_moves,
    hash_position, terminal_loser, search_root, DEFAULT_TEMPERATURE,
)


def play_game_bb(white_cfg, black_cfg, start, seed=None, max_moves=200,
                 claim_draws=True):
    """Bitboard-native game loop — the one used for corpus generation.

    Returns (result, plies) where result carries the outcome and `plies` is a
    list of (move, strikes_mask) with the move packed as (from << 5) | to.

    This exists alongside play_one_game because that one converts a dict
    game-state to bitboards on every ply, and at corpus scale (millions of
    games, tens of millions of plies) the conversion dominates. Rules,
    draw handling and blunder semantics are identical.
    """
    rng = random.Random(seed)
    occ, white, rok, stm = start

    white_blunder = white_cfg.get('blunder_rate', 0.0)
    black_blunder = black_cfg.get('blunder_rate', 0.0)
    white_kwargs = {k: v for k, v in white_cfg.items() if k != 'blunder_rate'}
    black_kwargs = {k: v for k, v in black_cfg.items() if k != 'blunder_rate'}

    plies = []
    repetitions = {bb.zobrist(occ, white, rok, stm): 1}
    quiet_plies = 0
    winner = termination = None
    t0 = time.perf_counter()

    while len(plies) < max_moves:
        loser = bb.terminal_loser(occ, white, rok, stm)
        if loser is not None:
            winner = 'WHITE' if loser == bb.BLACK else 'BLACK'
            black_mask = occ & ~white
            termination = ('total_conversion'
                           if not black_mask or not white else 'no_legal_moves')
            break

        is_white_turn = stm == bb.WHITE
        cfg = white_kwargs if is_white_turn else black_kwargs
        blunder = white_blunder if is_white_turn else black_blunder

        move, scored, _depth = search_root(occ, white, rok, stm, rng=rng, **cfg)
        if move is None:
            break

        if blunder and len(scored) > 1 and rng.random() < blunder:
            move = rng.choice([m for m, _ in scored[1:3]])

        was_cob = not ((rok >> (move >> 5)) & 1)
        strikes = bb.move_strikes(occ, white, rok, stm, move)
        rok_before = rok
        occ, white, rok, stm = bb.make_move(occ, white, rok, stm, move)
        plies.append((move, strikes))

        # §7.2.2 — a cob move or any promotion resets the 50-move counter.
        promoted = rok != rok_before
        quiet_plies = 0 if (was_cob or promoted) else quiet_plies + 1

        key = bb.zobrist(occ, white, rok, stm)
        repetitions[key] = repetitions.get(key, 0) + 1
        if claim_draws:
            if repetitions[key] >= 3:
                winner, termination = 'DRAW', 'threefold'
                break
            if quiet_plies >= 100:
                winner, termination = 'DRAW', 'fifty_move'
                break

    if termination is None:
        if len(plies) >= max_moves:
            winner, termination = 'DRAW', 'move_limit'
        else:
            loser = bb.terminal_loser(occ, white, rok, stm)
            if loser is None:
                winner, termination = 'DRAW', 'move_limit'
            else:
                winner = 'WHITE' if loser == bb.BLACK else 'BLACK'
                black_mask = occ & ~white
                termination = ('total_conversion'
                               if not black_mask or not white else 'no_legal_moves')

    return {
        'winner': winner,
        'termination': termination,
        'total_moves': len(plies),
        'duration_ms': (time.perf_counter() - t0) * 1000,
        'final': (occ, white, rok, stm),
    }, plies


def _clone(state):
    return {
        'checkers': {k: dict(v) for k, v in state['checkers'].items()},
        'currentTurn': state['currentTurn'],
    }


def play_one_game(
    white_depth,
    black_depth,
    max_moves=200,
    seed=None,
    white_ai_kwargs=None,
    black_ai_kwargs=None,
    random_first_move=False,
    skip_board_after=False,
    start_state=None,
    claim_draws=True,
):
    """Play a single AI-vs-AI game and return (game_record, move_records).

    Parameters
    ----------
    white_depth : int — minimax depth for WHITE
    black_depth : int — minimax depth for BLACK
    max_moves   : int — half-move limit (prevents unbounded games)
    seed              : int  — seeds a private RNG stream for this game
    random_first_move : bool — if True, move 1 is sampled uniformly from legal moves
    skip_board_after  : bool — if True, omit board_after JSON from move records
    start_state       : dict — position to start from (defaults to the opening setup)
    claim_draws       : bool — enforce threefold repetition and the 50-move rule

    ``blunder_rate`` is read out of each side's ai_kwargs, so it is a property
    of that player rather than of the game: the probability that this side
    deliberately plays its 2nd or 3rd best move. It is how the corpus acquires
    positions with a punishing reply available, and it must be per-side —
    a game-level rate would weaken a weak config's opponent too, which would
    quietly flatten the whole ladder this calibrates.

    The RNG is a private ``random.Random`` stream rather than the global one.
    Seeding the global RNG made every game with the same config collapse onto
    the same line — in the previous corpus one opening accounted for 64% of the
    deterministic games.
    """
    rng = random.Random(seed)

    white_ai_kwargs = dict(white_ai_kwargs or {})
    black_ai_kwargs = dict(black_ai_kwargs or {})
    blunder = {
        'WHITE': white_ai_kwargs.pop('blunder_rate', 0.0),
        'BLACK': black_ai_kwargs.pop('blunder_rate', 0.0),
    }

    state = _clone(start_state) if start_state is not None else initial_game_state()
    move_records = []
    move_number = 0
    t0 = time.perf_counter()

    # Draw bookkeeping (patent §7.2)
    repetitions = {hash_position(state): 1}
    quiet_plies = 0          # half-moves since a cob moved or anything promoted
    termination = None
    winner = None

    while move_number < max_moves:
        if is_game_over(state):
            loser = terminal_loser(state)
            winner = OPPONENT[loser]
            colors = set(c['color'] for c in state['checkers'].values())
            termination = 'total_conversion' if len(colors) == 1 else 'no_legal_moves'
            break

        color = state['currentTurn']
        depth = white_depth if color == 'WHITE' else black_depth

        if random_first_move and move_number == 0:
            legal_moves = get_all_possible_moves(state)
            from_v, to_v = rng.choice(legal_moves)
        else:
            ai_kwargs = black_ai_kwargs if color == 'BLACK' else white_ai_kwargs
            result = get_next_best_move(
                state,
                depth=depth,
                randomize=True,
                rng=rng,
                **ai_kwargs,
            )
            if result['move'] is None:
                break
            from_v, to_v = result['move']

            # Deliberate mistake: take a demonstrably worse move so the corpus
            # contains positions where a punishing reply exists.
            if blunder[color] and rng.random() < blunder[color]:
                alternatives = [m for m, _ in result['scores'][1:3]]
                if alternatives:
                    from_v, to_v = rng.choice(alternatives)

        was_cob = not state['checkers'][from_v]['isUpgraded']
        new_board, strikes, upgrades = apply_move_to_board(state, from_v, to_v)
        new_board['currentTurn'] = OPPONENT[color]

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

        # §7.2.2 — a cob move or any promotion resets the 50-move counter.
        quiet_plies = 0 if (was_cob or upgrades) else quiet_plies + 1

        key = hash_position(state)
        repetitions[key] = repetitions.get(key, 0) + 1

        if claim_draws:
            if repetitions[key] >= 3:
                winner, termination = 'DRAW', 'threefold'
                break
            if quiet_plies >= 100:
                winner, termination = 'DRAW', 'fifty_move'
                break

    if termination is None:
        if move_number >= max_moves:
            winner, termination = 'DRAW', 'move_limit'
        else:
            # Loop exited because the search returned no move.
            loser = terminal_loser(state)
            if loser is None:
                winner, termination = 'DRAW', 'move_limit'
            else:
                winner = OPPONENT[loser]
                colors = set(c['color'] for c in state['checkers'].values())
                termination = 'total_conversion' if len(colors) == 1 else 'no_legal_moves'

    game_record = {
        'white_depth': white_depth,
        'black_depth': black_depth,
        'winner': winner,
        'total_moves': move_number,
        'termination': termination,
        'duration_ms': (time.perf_counter() - t0) * 1000,
    }

    return game_record, move_records


def worker(args):
    """Top-level worker for ProcessPoolExecutor (must be importable for pickling)."""
    # Backward compatible with old task tuple shapes:
    #   4-tuple: (white_depth, black_depth, max_moves, seed)
    #   6-tuple: + (white_ai_kwargs, black_ai_kwargs)
    #   7-tuple: + (random_first_move,)
    #   8-tuple: + (skip_board_after,)
    # New callers should pass a dict instead.
    if isinstance(args, dict):
        return play_one_game(**args)

    n = len(args)
    white_depth, black_depth, max_moves, seed = args[:4]
    return play_one_game(
        white_depth,
        black_depth,
        max_moves,
        seed,
        white_ai_kwargs=args[4] if n > 4 else None,
        black_ai_kwargs=args[5] if n > 5 else None,
        random_first_move=args[6] if n > 6 else False,
        skip_board_after=args[7] if n > 7 else False,
    )
