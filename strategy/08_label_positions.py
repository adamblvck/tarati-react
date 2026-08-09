#!/usr/bin/env python3
"""08_label_positions.py — label corpus positions with an oracle.

This is the step that separates a strategy guide from a pile of game logs.

Without it, every claim has to be an outcome correlation — "games where White
played C1-C12 were won 47% of the time" — which is confounded by who was
playing, what tier they were, and which opening they came from. With it, a
claim becomes "in this position type, playing X instead of the best move costs
an average of 0.4 pieces over N positions", which is what a reader can act on.

Two tables, deliberately separated:

  positions  one row per *distinct* board, carrying the expensive oracle result
             (best move, the score of every legal move) plus structural
             features. Positions recur across games, and the oracle is by far
             the dominant cost, so it must run once per board rather than once
             per sighting.

  plays      one row per sighting: which game, which ply, which tier played it,
             what they actually played, and what it cost them. This is what
             carries "how a 450-Elo player errs here" versus "how a 1,090-Elo
             player errs here".

Run under PyPy:

    pypy3.11 08_label_positions.py --per-tier 6000 --depth 12
    pypy3.11 08_label_positions.py --summary

Resumable: positions already carrying an oracle result are skipped.
"""

import argparse
import json
import math
import os
import random
import sqlite3
import sys
import time
from concurrent.futures import ProcessPoolExecutor, FIRST_COMPLETED, wait
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb
from engine import search2
from engine.ai import WINNING_SCORE, MATE_THRESHOLD, TranspositionTable, _root_scores

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
CORPUS_PATH = os.path.join(DATA_DIR, 'corpus.sqlite')
LABEL_PATH = os.path.join(DATA_DIR, 'labels.sqlite')

CORE_FRACTION = 0.8
DEFAULT_WORKERS = max(1, int((os.cpu_count() or 4) * CORE_FRACTION))

#: Where in each game to sample, as fractions of its length. Spread across the
#: phases so the guide's opening, middlegame and endgame chapters all rest on
#: comparable evidence rather than on whatever ply happened to be convenient.
SAMPLE_FRACTIONS = (0.10, 0.30, 0.50, 0.70, 0.88)

BATCH = 400


# ─── Features ────────────────────────────────────────────────────────────

B_RING = bb._mask(['B1', 'B2', 'B3', 'B4', 'B5', 'B6'])
A_HUB = bb._mask(['A1'])
C_RING = bb._mask(['C%d' % i for i in range(1, 13)])


def strike_counts(occ, white, rok, stm):
    """(available strikes, strikes denied by the pre-adjacency rule).

    The second number has no equivalent in an ordinary capture game and is the
    most Tarati-specific thing a position can be measured on: how many captures
    are *geometrically* there but forbidden because the attacker already stood
    next to the target (patent §4.1).
    """
    enemy = (occ & ~white) if stm == bb.WHITE else white
    available = denied = 0
    for move in bb.gen_moves(occ, white, rok, stm):
        src, dst = move >> 5, move & 31
        if src == dst:
            continue
        adjacent = bb.ADJ[dst] & enemy
        if adjacent & ~bb.ADJ[src]:
            available += 1
        elif adjacent:
            denied += 1
    return available, denied


def features(occ, white, rok, stm):
    black = occ & ~white
    white_rok = white & rok
    black_rok = black & rok

    white_mob = bb.mobility(occ, white, rok, bb.WHITE)
    black_mob = bb.mobility(occ, white, rok, bb.BLACK)
    strikes_avail, strikes_denied = strike_counts(occ, white, rok, stm)

    def advancement(mask, colour):
        total = 0
        for i in bb.bit_list(mask):
            total += (bb.MAX_RANK - bb.RANK_OF[i]) if colour == bb.WHITE else bb.RANK_OF[i]
        return total

    return {
        'material': white.bit_count() - black.bit_count(),
        'white_roks': white_rok.bit_count(),
        'black_roks': black_rok.bit_count(),
        'hub': (1 if white & A_HUB else 0) - (1 if black & A_HUB else 0),
        'b_ring': (white & B_RING).bit_count() - (black & B_RING).bit_count(),
        'c_ring': (white & C_RING).bit_count() - (black & C_RING).bit_count(),
        'home_white': (white & bb.HOME[bb.WHITE]).bit_count(),
        'home_black': (black & bb.HOME[bb.BLACK]).bit_count(),
        'mobility': white_mob - black_mob,
        'strikes_available': strikes_avail,
        'strikes_denied': strikes_denied,
        'jammed_white': (white & ~rok & bb.DEAD[bb.WHITE]).bit_count(),
        'jammed_black': (black & ~rok & bb.DEAD[bb.BLACK]).bit_count(),
        'advancement': advancement(white & ~rok, bb.WHITE) - advancement(black & ~rok, bb.BLACK),
    }


# ─── Oracle ──────────────────────────────────────────────────────────────
#
# Two oracles, selected by `--oracle`.
#
# `legacy` is the shipped `ai.py` search, and it is what produced the original
# `labels.sqlite`. It has no quiescence, so it stops in the middle of exchanges
# and its *gaps* (best move minus runner-up) are inflated by the horizon: on a
# 160-position check, 94% of the positions it called "wins by more than a
# piece" have a gap under one piece when re-scored with quiescence. Keep it only
# to reproduce the old file.
#
# `mined+q` is the variant from `10_engine_lab.py` — refitted weights plus
# quiescence plus killer/history/PVS ordering — measured at +191 to +241 Elo
# over `legacy`. Depth 12 is enough: on the same check it agrees with a depth-16
# search on 93.8% of chosen moves, and on 99.4% of the strike-vs-quiet
# classifications the guide actually uses, for an eighth of the nodes.

_DEPTH = 12
_ORACLE = 'legacy'


def _init_worker(depth, oracle='legacy'):
    global _DEPTH, _ORACLE
    _DEPTH = depth
    _ORACLE = oracle


def evaluate_position(key):
    """Score every legal move. Returns (key, best_move, scores, features)."""
    occ, white, rok, stm = key

    if _ORACLE == 'legacy':
        tt = TranspositionTable()
        scored = None
        for depth in range(1, _DEPTH + 1):
            scored = _root_scores(occ, white, rok, stm, depth, tt, None)
            if abs(scored[0][1]) > MATE_THRESHOLD:
                break
    else:
        engine = search2.make(_ORACLE)
        # Full windows at the root: a narrowed window makes every sibling score
        # after the first a bound rather than a value, and the guide reads those
        # sibling scores directly to compute per-move loss.
        _move, scored, _d = engine.search_root(
            occ, white, rok, stm, depth=_DEPTH, temperature=1.0,
            max_nodes=4_000_000)

    return key, scored[0][0], scored, features(occ, white, rok, stm)


# ─── Sampling ────────────────────────────────────────────────────────────

def sample_sightings(corpus, per_tier, rng):
    """Replay a tier-stratified sample of games and emit sightings.

    Sampling the corpus proportionally would be a mistake here. Corpus games
    were allocated by compute share, so the cheap tiers dominate by construction
    — L1 appears in 47.9% of games and L8 in 0.16%. A proportional draw would
    describe how a 0-Elo engine plays and say almost nothing about strong play,
    which is precisely what a strategy guide needs most.

    Each tier is therefore sampled up to `per_tier` games independently, and
    scarce tiers are simply taken in full.
    """
    tiers = [row[0] for row in corpus.execute(
        'SELECT DISTINCT white_tier FROM games ORDER BY 1')]

    chosen = {}
    for tier in tiers:
        rows = corpus.execute(
            'SELECT game_id, white_tier, black_tier, winner, total_moves, '
            'seed_occ, seed_white, seed_rok, seed_stm FROM games '
            'WHERE total_moves >= 8 AND (white_tier = ? OR black_tier = ?) '
            'ORDER BY game_id LIMIT ?', (tier, tier, per_tier)).fetchall()
        for row in rows:
            chosen[row[0]] = row[1:]
        print('  %-4s %6d games available for sampling' % (tier, len(rows)),
              flush=True)

    meta = chosen
    sightings = []
    chunk = 5000
    id_list = list(meta)

    for start in range(0, len(id_list), chunk):
        block = id_list[start:start + chunk]
        moves = {}
        query = ('SELECT game_id, ply, move FROM moves WHERE game_id IN (%s) '
                 'ORDER BY game_id, ply' % ','.join('?' * len(block)))
        for game_id, ply, move in corpus.execute(query, block):
            moves.setdefault(game_id, []).append(move)

        for game_id, game_moves in moves.items():
            (white_tier, black_tier, winner, total_moves,
             s_occ, s_white, s_rok, s_stm) = meta[game_id]
            wanted = sorted({min(len(game_moves) - 1, max(0, int(f * len(game_moves))))
                             for f in SAMPLE_FRACTIONS})
            # Games start from seeded positions, so replay from the recorded
            # seed rather than from the opening setup.
            occ, white, rok, stm = s_occ, s_white, s_rok, s_stm

            target = set(wanted)
            for ply, move in enumerate(game_moves):
                if ply in target:
                    tier = white_tier if stm == bb.WHITE else black_tier
                    sightings.append(((occ, white, rok, stm), move, game_id,
                                      ply, tier, winner))
                occ, white, rok, stm = bb.make_move(occ, white, rok, stm, move)
    return sightings


# ─── Database ────────────────────────────────────────────────────────────

def init_db(path=None):
    conn = sqlite3.connect(path or LABEL_PATH)
    cur = conn.cursor()
    cur.execute('PRAGMA journal_mode=WAL')
    cur.fetchall()
    cur.execute('PRAGMA synchronous=NORMAL')
    cur.fetchall()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS positions (
            occ INTEGER NOT NULL, white INTEGER NOT NULL,
            rok INTEGER NOT NULL, stm INTEGER NOT NULL,
            best_move  INTEGER NOT NULL,
            best_score INTEGER NOT NULL,   -- side-to-move perspective
            n_moves    INTEGER NOT NULL,
            scores_json TEXT NOT NULL,     -- [[move, score], ...] best first
            features_json TEXT NOT NULL,
            PRIMARY KEY (occ, white, rok, stm)
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS plays (
            occ INTEGER NOT NULL, white INTEGER NOT NULL,
            rok INTEGER NOT NULL, stm INTEGER NOT NULL,
            game_id      INTEGER NOT NULL,
            ply          INTEGER NOT NULL,
            tier         TEXT    NOT NULL,
            played_move  INTEGER NOT NULL,
            best_score   INTEGER NOT NULL,  -- side-to-move perspective
            played_score INTEGER NOT NULL,
            loss         INTEGER NOT NULL,  -- centipieces given away vs best
            -- 1 when either score is a forced result. Such a move did not cost
            -- a measurable amount of material, it changed the outcome, and
            -- averaging the two kinds together is meaningless: mixing them
            -- produced a "mean loss" of 1,052 pieces on an eight-piece board.
            decisive     INTEGER NOT NULL,
            game_winner  TEXT    NOT NULL
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_plays_pos '
                'ON plays (occ, white, rok, stm)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_plays_tier ON plays (tier, loss)')
    cur.close()
    conn.commit()
    return conn


def summary(path=None):
    path = path or LABEL_PATH
    if not os.path.exists(path):
        print('No labels yet.')
        return
    conn = sqlite3.connect(path)
    pos = conn.execute('SELECT COUNT(*) FROM positions').fetchone()[0]
    plays = conn.execute('SELECT COUNT(*) FROM plays').fetchone()[0]
    if not pos:
        print('Empty.')
        return
    print('positions: %d   sightings: %d   size: %.2f GB'
          % (pos, plays, os.path.getsize(LABEL_PATH) / 1e9))

    # A move that throws a forced win has a loss near 2,000,000 — the gap
    # between a proven win and a proven loss. Averaging those together with
    # ordinary centipiece errors produces a meaningless number (the first run
    # of this reported a "mean loss" of 105,224 centipieces, i.e. 1,052 pieces
    # on a board that holds eight). Decisive errors are therefore counted
    # separately from quantitative ones.
    quiet = 'decisive = 0'

    print('\nmove quality by tier (Elo rises down the list):')
    print('  tier   plays    %best   mean loss   median   %blunder   %decisive')
    for tier, n in conn.execute(
            'SELECT tier, COUNT(*) FROM plays GROUP BY tier ORDER BY tier'):
        stats = conn.execute('''
            SELECT SUM(CASE WHEN loss = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
                   SUM(decisive) * 100.0 / COUNT(*)
            FROM plays WHERE tier = ?''', (tier,)).fetchone()
        qstats = conn.execute('''
            SELECT COUNT(*), AVG(loss),
                   SUM(CASE WHEN loss > 100 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
            FROM plays WHERE tier = ? AND %s''' % quiet, (tier,)).fetchone()
        qn, mean, blunder = qstats
        med = conn.execute(
            'SELECT loss FROM plays WHERE tier = ? AND %s ORDER BY loss '
            'LIMIT 1 OFFSET ?' % quiet, (tier, max(0, qn // 2))).fetchone()
        print('  %-5s %8d %8.1f %11.1f %8s %10.1f %12.1f'
              % (tier, n, stats[0], mean or 0, med[0] if med else '-',
                 blunder or 0, stats[1]))

    print('\nmove quality by game phase (quantitative errors only):')
    for row in conn.execute('''
        SELECT CASE WHEN ply < 10 THEN '1 opening'
                    WHEN ply < 25 THEN '2 middlegame'
                    ELSE '3 endgame' END AS phase,
               COUNT(*), AVG(loss),
               SUM(CASE WHEN loss = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
        FROM plays WHERE %s GROUP BY phase ORDER BY phase''' % quiet):
        print('  %-14s %8d  mean loss %8.1f  %%best %5.1f' % row)

    print('\ndecisive errors by phase (a move that throws a proven result):')
    for row in conn.execute('''
        SELECT CASE WHEN ply < 10 THEN '1 opening'
                    WHEN ply < 25 THEN '2 middlegame'
                    ELSE '3 endgame' END AS phase,
               COUNT(*),
               SUM(CASE WHEN decisive = 1 AND loss > 0 THEN 1 ELSE 0 END)
                   * 100.0 / COUNT(*)
        FROM plays GROUP BY phase ORDER BY phase'''):
        print('  %-14s %8d  %%changed the result %5.1f' % row)
    conn.close()


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--per-tier', type=int, default=6000,
                        help='games sampled per tier (scarce tiers taken in full)')
    parser.add_argument('--depth', type=int, default=12)
    parser.add_argument('--workers', type=int, default=DEFAULT_WORKERS)
    parser.add_argument('--summary', action='store_true')
    parser.add_argument('--oracle', default='legacy',
                        choices=['legacy'] + list(search2.VARIANTS),
                        help='legacy reproduces the original labels.sqlite; '
                             'mined+q is the measured-stronger engine')
    parser.add_argument('--out', default=None,
                        help='output database (default data/labels.sqlite)')
    args = parser.parse_args()

    if args.summary:
        summary(args.out)
        return

    # The seed is fixed so that re-running with a different --oracle samples
    # the identical positions, which is what makes the two label sets directly
    # comparable rather than merely similar.
    rng = random.Random(20260722)
    corpus = sqlite3.connect('file:%s?mode=ro' % CORPUS_PATH, uri=True)
    conn = init_db(args.out)
    print('oracle: %s at depth %d -> %s'
          % (args.oracle, args.depth, args.out or LABEL_PATH), flush=True)

    print('sampling positions from the corpus...', flush=True)
    t0 = time.perf_counter()
    sightings = sample_sightings(corpus, args.per_tier, rng)
    corpus.close()

    unique = {}
    for key, move, game_id, ply, tier, winner in sightings:
        unique.setdefault(key, None)
    print('  %d sightings over %d distinct positions (%.0fs)'
          % (len(sightings), len(unique), time.perf_counter() - t0), flush=True)

    have = set(conn.execute('SELECT occ, white, rok, stm FROM positions'))
    todo = [k for k in unique if k not in have]
    print('  %d already labelled, %d to evaluate at depth %d with %d workers'
          % (len(unique) - len(todo), len(todo), args.depth, args.workers),
          flush=True)

    t0 = time.perf_counter()
    buffer = []
    executor = ProcessPoolExecutor(max_workers=args.workers,
                                   initializer=_init_worker,
                                   initargs=(args.depth, args.oracle))
    try:
        stream = iter(todo)
        pending = set()
        exhausted = False
        done = 0
        while True:
            while not exhausted and len(pending) < args.workers * 8:
                try:
                    pending.add(executor.submit(evaluate_position, next(stream)))
                except StopIteration:
                    exhausted = True
            if not pending:
                break
            finished, pending = wait(pending, return_when=FIRST_COMPLETED)
            for future in finished:
                key, best_move, scored, feats = future.result()
                buffer.append((key, best_move, scored, feats))
                done += 1
            if len(buffer) >= BATCH:
                _flush_positions(conn, buffer)
                buffer = []
            if done % 5000 < len(finished):
                elapsed = time.perf_counter() - t0
                rate = done / elapsed
                print('  %d/%d positions  %.0f/s  ETA %s'
                      % (done, len(todo), rate,
                         timedelta(seconds=int((len(todo) - done) / max(rate, 1e-9)))),
                      flush=True)
    finally:
        if buffer:
            _flush_positions(conn, buffer)
        executor.shutdown(wait=False, cancel_futures=True)

    # Reload every labelled position so sightings of previously-done work also
    # get their loss recorded.
    lookup = {}
    for occ, white, rok, stm, best, scores_json in conn.execute(
            'SELECT occ, white, rok, stm, best_score, scores_json FROM positions'):
        lookup[(occ, white, rok, stm)] = (best, json.loads(scores_json))

    print('\nrecording %d sightings...' % len(sightings), flush=True)
    rows = []
    for key, move, game_id, ply, tier, winner in sightings:
        entry = lookup.get(key)
        if entry is None:
            continue
        best_score, scores = entry
        played = next((s for m, s in scores if m == move), None)
        if played is None:
            continue
        decisive = int(abs(best_score) > MATE_THRESHOLD
                       or abs(played) > MATE_THRESHOLD)
        rows.append((key[0], key[1], key[2], key[3], game_id, ply, tier,
                     move, best_score, played, best_score - played,
                     decisive, winner))
    cur = conn.cursor()
    cur.execute('DELETE FROM plays')
    cur.executemany('INSERT INTO plays VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', rows)
    cur.close()
    conn.commit()
    conn.close()

    print('done in %s' % timedelta(seconds=int(time.perf_counter() - t0)))
    summary(args.out)


def _flush_positions(conn, buffer):
    cur = conn.cursor()
    cur.executemany(
        'INSERT OR REPLACE INTO positions VALUES (?,?,?,?,?,?,?,?,?)',
        [(k[0], k[1], k[2], k[3], best, scored[0][1], len(scored),
          json.dumps([[m, s] for m, s in scored]), json.dumps(feats))
         for k, best, scored, feats in buffer])
    cur.close()
    conn.commit()


if __name__ == '__main__':
    main()
