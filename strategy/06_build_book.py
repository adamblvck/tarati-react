#!/usr/bin/env python3
"""06_build_book.py — solve the Tarati opening exhaustively.

The opening does not need to be sampled. Under transposition merging the
effective branching factor is about 2.57, so the whole tree is small:

    ply  4:        357 distinct positions
    ply  8:     31,913
    ply 10:    235,693
    ply 12:  1,546,911

Every position up to the horizon is enumerated, the leaves are evaluated by the
oracle, and values are backed up the DAG with negamax. A ply-12 horizon with a
depth-12 oracle gives the root roughly 24 plies of analysis — far beyond what
sampling 500,000 games could establish, and exact rather than statistical.

The previous corpus randomised only the first move, which yields exactly four
distinct openings, so its "opening theory" rested on four data points.

Run under PyPy:

    pypy3.11 06_build_book.py --ply 12 --oracle-depth 12
    pypy3.11 06_build_book.py --ply 8 --oracle-depth 10   # quick pass

Draw rules are ignored during backup: threefold repetition needs a position to
recur three times and the 50-move rule needs 100 quiet plies, neither of which
is reachable within a 12-ply horizon from the opening setup.

A caveat on the ``value`` column, verified after this book was first built and
recorded in the DB's ``meta`` table. Tarati has a tempo (zugzwang-like)
property: the side forced to move is at a disadvantage, because a cob's forward
move is irreversible. The oracle picks this up as a horizon effect — the root
value is near zero through depth 10, then jumps to about +-230cp at depth 11
and flips sign with every further ply of depth. It is symmetric in colour (both
White-to-move and Black-to-move read the mover behind), so it is genuinely
about the tempo and not about which side is White. The consequence: absolute
values carry a ~230cp offset of unknown sign and must NOT be read as "who is
winning". Per-move *loss* is offset-free — every sibling of a node is scored at
the same horizon parity, so the difference is clean — and remains the right
quantity for judging move quality.
"""

import argparse
import json
import math
import os
import sqlite3
import sys
import time
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb
from engine.ai import WINNING_SCORE, TranspositionTable, _search

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
BOOK_PATH = os.path.join(DATA_DIR, 'book.sqlite')
JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         '..', 'public', 'opening-book.json')

#: Full per-move detail is kept only for the shallow plies a human guide can
#: actually use; deeper nodes store just a value and a best move.
DETAIL_PLY = 8
#: The browser-facing export stays small enough to ship with the app.
JSON_PLY = 6


def pack(occ, white, rok, stm):
    return occ | (white << 23) | (rok << 46) | (stm << 69)


def unpack(key):
    return (key & 0x7FFFFF, (key >> 23) & 0x7FFFFF, (key >> 46) & 0x7FFFFF, key >> 69)


# ─── Pass 1: enumerate the tree ──────────────────────────────────────────

def enumerate_levels(max_ply):
    """Distinct positions at each ply, merged across transpositions."""
    levels = [[pack(*bb.INITIAL)]]
    seen_terminal = 0

    for ply in range(max_ply):
        current = levels[-1]
        nxt = {}
        for key in current:
            occ, white, rok, stm = unpack(key)
            if bb.terminal_loser(occ, white, rok, stm) is not None:
                continue
            for move in bb.gen_moves(occ, white, rok, stm):
                child = bb.make_move(occ, white, rok, stm, move)
                nxt[pack(*child)] = None
        levels.append(list(nxt))
        print('  ply %2d: %10d distinct positions' % (ply + 1, len(levels[-1])),
              flush=True)

    return levels


# ─── Pass 2: oracle-evaluate the leaves ──────────────────────────────────

_ORACLE_DEPTH = 12


def _init_worker(depth):
    global _ORACLE_DEPTH
    _ORACLE_DEPTH = depth


def evaluate_leaf(key):
    """Oracle value of a leaf, from the side-to-move's perspective."""
    occ, white, rok, stm = unpack(key)
    loser = bb.terminal_loser(occ, white, rok, stm)
    if loser is not None:
        return key, (-WINNING_SCORE if loser == stm else WINNING_SCORE)
    tt = TranspositionTable()
    value = _search(occ, white, rok, stm, _ORACLE_DEPTH,
                    -math.inf, math.inf, 0, tt, None)
    return key, value


# ─── Pass 3: back values up the DAG ──────────────────────────────────────

def back_up(levels, leaf_values):
    """Negamax the leaf values back to the root.

    Values are stored per (position, ply) rather than per position: the same
    board can appear at two different plies with different remaining horizons,
    and under fixed-depth search those are genuinely different quantities.
    """
    values = [None] * len(levels)
    values[-1] = leaf_values
    best_moves = [None] * len(levels)

    for ply in range(len(levels) - 2, -1, -1):
        child_values = values[ply + 1]
        level_values = {}
        level_best = {}

        for key in levels[ply]:
            occ, white, rok, stm = unpack(key)
            loser = bb.terminal_loser(occ, white, rok, stm)
            if loser is not None:
                level_values[key] = -WINNING_SCORE if loser == stm else WINNING_SCORE
                continue

            best = -math.inf
            best_move = -1
            scored = []
            for move in bb.gen_moves(occ, white, rok, stm):
                child = bb.make_move(occ, white, rok, stm, move)
                child_value = child_values.get(pack(*child))
                if child_value is None:
                    continue
                value = -child_value
                scored.append((move, value))
                if value > best:
                    best = value
                    best_move = move

            if best_move < 0:
                continue
            level_values[key] = best
            level_best[key] = (best_move, scored if ply < DETAIL_PLY else None)

        values[ply] = level_values
        best_moves[ply] = level_best
        print('  backed up ply %2d: %10d positions' % (ply, len(level_values)),
              flush=True)

    return values, best_moves


# ─── Output ──────────────────────────────────────────────────────────────

def write_book(levels, values, best_moves, max_ply, oracle_depth):
    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.exists(BOOK_PATH):
        os.remove(BOOK_PATH)
    conn = sqlite3.connect(BOOK_PATH)
    # One explicit cursor, closed before commit: PyPy's sqlite3 refuses to
    # commit while any statement is still in progress, and connection-level
    # execute() leaves an unconsumed cursor behind each time.
    cur = conn.cursor()
    cur.execute('PRAGMA journal_mode=WAL')
    cur.fetchall()
    cur.execute('''
        CREATE TABLE book (
            ply        INTEGER NOT NULL,
            occ        INTEGER NOT NULL,
            white      INTEGER NOT NULL,
            rok        INTEGER NOT NULL,
            stm        INTEGER NOT NULL,
            value      INTEGER NOT NULL,   -- centipieces, positive favours WHITE
            best_from  TEXT,
            best_to    TEXT,
            n_moves    INTEGER NOT NULL,
            moves_json TEXT,               -- per-move loss, shallow plies only
            -- Keyed on the four board words rather than a single packed
            -- integer: the packed form needs 70 bits, SQLite integers are 64.
            PRIMARY KEY (occ, white, rok, stm, ply)
        )
    ''')
    cur.execute('CREATE INDEX idx_book_ply ON book (ply, value)')

    rows = []
    for ply in range(max_ply + 1):
        level_values = values[ply] or {}
        level_best = best_moves[ply] or {}
        for key, stm_value in level_values.items():
            occ, white, rok, stm = unpack(key)
            white_value = stm_value if stm == bb.WHITE else -stm_value
            entry = level_best.get(key)
            best_from = best_to = None
            moves_json = None
            n_moves = 0
            if entry is not None:
                best_move, scored = entry
                best_from, best_to = bb.move_to_vertices(best_move)
                if scored is not None:
                    n_moves = len(scored)
                    top = max(s for _, s in scored)
                    moves_json = json.dumps([
                        {'from': bb.move_to_vertices(m)[0],
                         'to': bb.move_to_vertices(m)[1],
                         'loss': top - s}
                        for m, s in sorted(scored, key=lambda x: -x[1])
                    ])
                else:
                    n_moves = len(bb.gen_moves(occ, white, rok, stm))
            rows.append((ply, occ, white, rok, stm, white_value,
                         best_from, best_to, n_moves, moves_json))

    cur.executemany('INSERT INTO book VALUES (?,?,?,?,?,?,?,?,?,?)', rows)
    cur.execute('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)')
    cur.executemany('INSERT INTO meta VALUES (?,?)', [
        ('max_ply', str(max_ply)),
        ('oracle_depth', str(oracle_depth)),
        ('detail_ply', str(DETAIL_PLY)),
        ('eval_weights', json.dumps(bb.EVAL_WEIGHTS)),
    ])
    cur.close()
    conn.commit()
    conn.close()
    return len(rows)


def write_json(values, best_moves, max_ply, oracle_depth):
    """Small browser-facing export for in-app hints and post-game review."""
    entries = {}
    for ply in range(min(JSON_PLY, max_ply) + 1):
        level_values = values[ply] or {}
        level_best = best_moves[ply] or {}
        for key, stm_value in level_values.items():
            occ, white, rok, stm = unpack(key)
            entry = level_best.get(key)
            if entry is None:
                continue
            best_move, scored = entry
            record = {
                'ply': ply,
                'value': stm_value if stm == bb.WHITE else -stm_value,
                'best': list(bb.move_to_vertices(best_move)),
            }
            if scored:
                top = max(s for _, s in scored)
                record['moves'] = [
                    {'m': list(bb.move_to_vertices(m)), 'loss': top - s}
                    for m, s in sorted(scored, key=lambda x: -x[1])
                ]
            entries['%d:%d:%d:%d' % (occ, white, rok, stm)] = record

    os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
    with open(JSON_PATH, 'w') as handle:
        json.dump({
            'note': 'Exhaustive Tarati opening book. Key is occ:white:rok:stm '
                    'over the 23 vertices in engine/board.py order. Value is in '
                    'centipieces, positive favours WHITE.',
            'maxPly': min(JSON_PLY, max_ply),
            'oracleDepth': oracle_depth,
            'evalWeights': bb.EVAL_WEIGHTS,
            'entries': entries,
        }, handle, separators=(',', ':'))
    return len(entries), os.path.getsize(JSON_PATH)


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ply', type=int, default=12, help='book horizon')
    parser.add_argument('--oracle-depth', type=int, default=12,
                        help='search depth applied at each leaf')
    parser.add_argument('--workers', type=int,
                        default=max(2, (os.cpu_count() or 4) - 2))
    args = parser.parse_args()

    print('Enumerating the opening tree to ply %d...' % args.ply)
    t0 = time.perf_counter()
    levels = enumerate_levels(args.ply)
    total = sum(len(level) for level in levels)
    print('  %d positions total in %.1fs' % (total, time.perf_counter() - t0))

    leaves = levels[-1]
    print('\nOracle-evaluating %d leaves at depth %d (%d workers)...'
          % (len(leaves), args.oracle_depth, args.workers))
    t0 = time.perf_counter()
    leaf_values = {}
    with ProcessPoolExecutor(max_workers=args.workers,
                             initializer=_init_worker,
                             initargs=(args.oracle_depth,)) as executor:
        for n, (key, value) in enumerate(
                executor.map(evaluate_leaf, leaves, chunksize=256), 1):
            leaf_values[key] = value
            if n % 20000 == 0:
                elapsed = time.perf_counter() - t0
                rate = n / elapsed
                print('  %d/%d  %.0f pos/s  ETA %dm' %
                      (n, len(leaves), rate, int((len(leaves) - n) / rate / 60)),
                      flush=True)
    print('  done in %.1fs' % (time.perf_counter() - t0))

    print('\nBacking values up the DAG...')
    values, best_moves = back_up(levels, leaf_values)

    print('\nWriting outputs...')
    rows = write_book(levels, values, best_moves, args.ply, args.oracle_depth)
    n_json, size = write_json(values, best_moves, args.ply, args.oracle_depth)
    print('  %s: %d rows (%.0f MB)'
          % (os.path.relpath(BOOK_PATH), rows, os.path.getsize(BOOK_PATH) / 1e6))
    print('  %s: %d entries (%.0f KB)'
          % (os.path.relpath(JSON_PATH), n_json, size / 1024))

    root_value = values[0][pack(*bb.INITIAL)]
    print('\n  Root value (positive favours WHITE): %+d centipieces' % root_value)
    print('  Best first move: %s' %
          ' -> '.join(bb.move_to_vertices(best_moves[0][pack(*bb.INITIAL)][0])))
    scored = best_moves[0][pack(*bb.INITIAL)][1]
    if scored:
        top = max(s for _, s in scored)
        print('  All %d first moves, by loss:' % len(scored))
        for m, s in sorted(scored, key=lambda x: -x[1]):
            print('    %-9s %+5d  (loss %d)'
                  % ('-'.join(bb.move_to_vertices(m)), s, top - s))


if __name__ == '__main__':
    main()
