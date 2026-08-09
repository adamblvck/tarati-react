#!/usr/bin/env python3
"""Export the golden fixture that keeps engine/ai.py and src/AI.js in sync.

AI_ENGINE.md describes the JavaScript engine as a direct port of the Python
one, but nothing enforced it, and the two drifted while sharing the same four
search bugs. This writes a fixture both sides assert against.

Parity is required on observable behaviour — legal moves, evaluation, and the
full set of root scores at fixed depth — but deliberately not on internal
transposition hashes. The Python side uses 64-bit Zobrist keys, which JavaScript
cannot represent in its 32-bit bitwise operators without BigInt; since the
depth-exact table rule makes both engines transposition-transparent, identical
hashes are unnecessary for identical results.

Usage:
    python3 export_parity_fixture.py            # writes src/__tests__/parity-fixture.json
"""

import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb
from engine.ai import evaluate_board, get_all_possible_moves, get_next_best_move
from engine.board import initial_game_state
from engine.openings import enumerate_frontier

OUT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', 'src', '__tests__', 'parity-fixture.json',
)

#: Positions are drawn across the whole opening tree rather than from one depth,
#: so the fixture exercises quiet openings, tactical middlegames with captures
#: available, promotions, and dead-piece positions.
PLIES = [0, 1, 2, 3, 4, 6, 8, 10, 12]
PER_PLY = 60
SEARCH_DEPTHS = [2, 4, 6]


def sample_positions():
    rng = random.Random(20260722)
    seen = set()
    out = []

    for ply in PLIES:
        frontier = enumerate_frontier(ply, include_terminal=True)
        frontier.sort(key=lambda s: sorted(
            (v, c['color'], c['isUpgraded']) for v, c in s['checkers'].items()
        ))
        picks = frontier if len(frontier) <= PER_PLY else rng.sample(frontier, PER_PLY)
        for state in picks:
            key = (
                tuple(sorted((v, c['color'], c['isUpgraded'])
                             for v, c in state['checkers'].items())),
                state['currentTurn'],
            )
            if key in seen:
                continue
            seen.add(key)
            out.append((ply, state))
    return out


def build_case(ply, state):
    case = {
        'ply': ply,
        'checkers': {
            v: {'color': c['color'], 'isUpgraded': c['isUpgraded']}
            for v, c in state['checkers'].items()
        },
        'currentTurn': state['currentTurn'],
        'evaluation': evaluate_board(state),
        'legalMoves': sorted([list(m) for m in get_all_possible_moves(state)]),
        'searches': {},
    }
    for depth in SEARCH_DEPTHS:
        result = get_next_best_move(state, depth=depth, randomize=False, use_tt=True)
        case['searches'][str(depth)] = {
            'score': result['score'],
            'move': list(result['move']) if result['move'] else None,
            # Sorted so the assertion does not depend on tie-break ordering,
            # which is free to differ between the two implementations.
            'rootScores': sorted([[list(m), s] for m, s in result['scores']]),
        }
    return case


def main():
    positions = sample_positions()
    cases = [build_case(ply, state) for ply, state in positions]

    fixture = {
        'generator': 'strategy/export_parity_fixture.py',
        'encoding': {
            'vertices': list(bb.VERTICES),
            'note': 'move = [fromVertex, toVertex]; from == to is a dead-piece '
                    'promotion (patent 6.3)',
        },
        'evalWeights': dict(bb.EVAL_WEIGHTS),
        'searchDepths': SEARCH_DEPTHS,
        'cases': cases,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w') as handle:
        json.dump(fixture, handle, indent=1, sort_keys=True)

    size_kb = os.path.getsize(OUT_PATH) / 1024
    terminal = sum(1 for c in cases if not c['legalMoves'])
    tactical = sum(1 for c in cases
                   if any(c['searches']['2']['score'] != c['evaluation'] for _ in [0]))
    print(f'wrote {len(cases)} cases to {os.path.relpath(OUT_PATH)} ({size_kb:.0f} KB)')
    print(f'  plies covered   : {sorted(set(c["ply"] for c in cases))}')
    print(f'  terminal cases  : {terminal}')
    print(f'  search depths   : {SEARCH_DEPTHS}')


if __name__ == '__main__':
    main()
