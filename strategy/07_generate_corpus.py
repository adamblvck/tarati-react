#!/usr/bin/env python3
"""07_generate_corpus.py — generate the game corpus the strategy guide rests on.

This replaces the difficulty-grid design of 04_mega_simulation.py, which had
three structural problems:

  * Difficulty was nominal search depth, never measured. Depths 12-20 turned
    out to be one player and depth 9 lost to depth 6.
  * Only the first move was randomised, which yields exactly four distinct
    openings — and by symmetry only two.
  * Draws conflated "unresolved at the 200-ply cap" with actual draws.

Here instead:

  * Tiers come from the measured Elo ladder in data/ladder.json.
  * Games are seeded from positions sampled across the whole opening book, at
    plies 0 through 10, so the corpus spans the opening tree.
  * Every seed is played twice with colours swapped, so colour cancels and each
    seeded position gets an unbiased value estimate.
  * Real threefold and fifty-move detection, recorded distinctly from the cap.
  * Moves are stored as two integers per ply instead of JSON text: the old
    corpus averaged 164 bytes per move row, which is where its 3.65 GB went.

Run under PyPy:

    pypy3.11 07_generate_corpus.py --hours 12
    pypy3.11 07_generate_corpus.py --hours 12 --workers 6
    pypy3.11 07_generate_corpus.py --summary

The run is bounded by wall clock, not by a game count: cost per game varies
about 100x across the tiers, so any count target either starves the cheap
matchups or overruns wildly. Tasks are ordered so that stopping at the deadline
leaves a proportionally balanced corpus.

Resumable: work already in the database is counted per (tier pair, seed ply)
bucket and skipped, so re-running simply extends the corpus.
"""

import argparse
import json
import os
import random
import sqlite3
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb
from engine.openings import frontier_bitboards
from engine.runner import play_game_bb

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DB_PATH = os.path.join(DATA_DIR, 'corpus.sqlite')
LADDER_PATH = os.path.join(DATA_DIR, 'ladder.json')

MAX_MOVES = 200
BATCH = 500

#: Leave headroom rather than saturating the machine — this runs for hours and
#: the box stays usable. Override with --workers.
CORE_FRACTION = 0.8
DEFAULT_WORKERS = max(1, int((os.cpu_count() or 4) * CORE_FRACTION))

#: How the corpus is spread over the opening tree. Deeper seeds cost nothing
#: extra to generate and are where the interesting middlegame structure lives,
#: but shallow seeds are what the openings chapter needs, so both are covered.
SEED_PLY_WEIGHTS = {0: 0.06, 2: 0.10, 4: 0.16, 6: 0.22, 8: 0.22, 10: 0.24}

#: Matchups, weighted toward near-equal pairs — that is where play is sharp and
#: where the mistakes worth writing about happen. Mismatches get a thinner
#: slice, enough to support the "how a stronger player punishes this" material.
DISTANCE_WEIGHTS = {0: 0.34, 1: 0.30, 2: 0.18, 3: 0.10, 4: 0.05, 5: 0.02, 6: 0.01}

#: Size of the task pool. Deliberately far larger than any budget can
#: consume — the deadline decides how much is actually played.
OVERSUBSCRIBE = 3_000_000


def load_ladder():
    with open(LADDER_PATH) as handle:
        data = json.load(handle)
    if not data.get('gates_passed'):
        raise SystemExit(
            'data/ladder.json reports gates_passed=false.\n'
            'Run 05_calibrate_ladder.py and get a clean ladder before generating '
            'a corpus — an unmeasured ladder is what invalidated the last one.')
    tiers = data['ladder']
    configs = {}
    for key in tiers:
        cfg = data['configs'][key]
        configs[key] = {
            'depth': cfg['depth'],
            'max_nodes': cfg['max_nodes'],
            'temperature': cfg['temperature'],
            'stochastic_top_k': 4 if cfg['temperature'] else 1,
            'blunder_rate': cfg['blunder_rate'],
        }
    return tiers, configs, data['elo']


# ─── Seed positions ──────────────────────────────────────────────────────

SEEDS_PER_PLY = 4000


def build_seeds():
    """Start positions per ply, computed once in the parent process.

    This must not be done lazily inside the workers: ply 10 has 235,693
    positions, and having ten workers each enumerate it independently dominated
    the first run of this script.
    """
    return {ply: frontier_bitboards(ply, SEEDS_PER_PLY) for ply in SEED_PLY_WEIGHTS}


# ─── Worker ──────────────────────────────────────────────────────────────

_CONFIGS = {}
_SEEDS = {}


def _init_worker(configs, seeds):
    global _CONFIGS, _SEEDS
    _CONFIGS = configs
    _SEEDS = seeds


def play_task(task):
    """One colour-balanced pair: the same seed played both ways."""
    tier_a, tier_b, ply, seed_index, pair_id = task
    seeds = _SEEDS[ply]
    start = seeds[seed_index % len(seeds)]
    cfg_a, cfg_b = _CONFIGS[tier_a], _CONFIGS[tier_b]

    out = []
    for a_is_white in (True, False):
        white_cfg, black_cfg = (cfg_a, cfg_b) if a_is_white else (cfg_b, cfg_a)
        white_tier, black_tier = (tier_a, tier_b) if a_is_white else (tier_b, tier_a)
        result, plies = play_game_bb(
            white_cfg, black_cfg, start,
            seed=pair_id * 2 + (0 if a_is_white else 1),
            max_moves=MAX_MOVES,
        )
        out.append((white_tier, black_tier, ply, start, pair_id, result, plies))
    return out


# ─── Database ────────────────────────────────────────────────────────────

def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('PRAGMA journal_mode=WAL')
    cur.fetchall()
    cur.execute('PRAGMA synchronous=NORMAL')
    cur.fetchall()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS games (
            game_id     INTEGER PRIMARY KEY AUTOINCREMENT,
            white_tier  TEXT    NOT NULL,
            black_tier  TEXT    NOT NULL,
            pair_id     INTEGER NOT NULL,   -- links the two colour-swapped games
            seed_ply    INTEGER NOT NULL,
            seed_occ    INTEGER NOT NULL,
            seed_white  INTEGER NOT NULL,
            seed_rok    INTEGER NOT NULL,
            seed_stm    INTEGER NOT NULL,
            winner      TEXT    NOT NULL,
            total_moves INTEGER NOT NULL,
            termination TEXT    NOT NULL,
            duration_ms REAL    NOT NULL
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS moves (
            game_id INTEGER NOT NULL,
            ply     INTEGER NOT NULL,
            move    INTEGER NOT NULL,   -- (from << 5) | to; from == to is a promotion
            strikes INTEGER NOT NULL    -- 23-bit mask of flipped pieces
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_moves_game ON moves (game_id, ply)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_games_matchup '
                'ON games (white_tier, black_tier, seed_ply)')
    cur.close()
    conn.commit()
    return conn


def existing_buckets(conn):
    rows = conn.execute(
        'SELECT white_tier, black_tier, seed_ply, COUNT(*) FROM games '
        'GROUP BY white_tier, black_tier, seed_ply').fetchall()
    counts = {}
    for wt, bt, ply, n in rows:
        key = (tuple(sorted((wt, bt))), ply)
        counts[key] = counts.get(key, 0) + n
    return counts


def flush(conn, buffer):
    cur = conn.cursor()
    for white_tier, black_tier, ply, start, pair_id, result, plies in buffer:
        cur.execute(
            'INSERT INTO games (white_tier, black_tier, pair_id, seed_ply, '
            'seed_occ, seed_white, seed_rok, seed_stm, winner, total_moves, '
            'termination, duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            (white_tier, black_tier, pair_id, ply,
             start[0], start[1], start[2], start[3],
             result['winner'], result['total_moves'], result['termination'],
             result['duration_ms']))
        gid = cur.lastrowid
        cur.executemany('INSERT INTO moves VALUES (?,?,?,?)',
                        [(gid, i, m, s) for i, (m, s) in enumerate(plies)])
    cur.close()
    conn.commit()


# ─── Schedule ────────────────────────────────────────────────────────────

def build_schedule(tiers, configs, existing, budget_hours, workers):
    """Order colour-balanced pairs so any prefix is a balanced corpus.

    Allocating by game *count* does not work here: a measured L8-vs-L8 game
    costs 15-30 seconds against 0.2 seconds for L1-vs-L1, a factor of about
    100, so a flat count hands almost the whole budget to the top tier. Shares
    are therefore divided by a cost proxy — the combined node budget, which is
    what bounds a search — so each bucket receives *compute* in proportion to
    its weight rather than game count. Only the ratio matters, not the units.

    An earlier version damped this with a square root, meaning to keep a fat
    sample of strong play; measured, that still spent most of the budget on the
    top two tiers and held the whole run to 0.8 games/second. Strong-tier games
    are also individually longer and richer, so they remain well represented.
    """
    index = {t: i for i, t in enumerate(tiers)}

    buckets = []
    for i, a in enumerate(tiers):
        for b in tiers[i:]:
            distance = abs(index[a] - index[b])
            pair_weight = DISTANCE_WEIGHTS.get(distance, 0.01)
            cost = configs[a]['max_nodes'] + configs[b]['max_nodes']
            for ply, ply_weight in SEED_PLY_WEIGHTS.items():
                share = pair_weight * ply_weight / cost
                buckets.append((a, b, ply, share, cost))

    total_share = sum(b[3] for b in buckets)

    # No attempt is made to predict how many games fit in the budget. A first
    # version modelled cost as proportional to the node budget and was wrong by
    # 10x on cheap matchups, because most of a short game's cost is per-ply
    # overhead rather than search. Instead the task list is built far longer
    # than the budget can consume and the run simply stops at its deadline.
    #
    # Tasks are then ordered by fractional progress through their own bucket,
    # so *any* prefix of the list is proportionally balanced across matchups
    # and seed plies. Stopping early truncates the corpus evenly rather than
    # along one axis.
    # Emitted lazily by a heap-merge over the buckets rather than built as a
    # list. Materialising three million tasks up front — and handing them all
    # to executor.map, which creates every future immediately — stalled the
    # process for minutes at zero CPU before any game was played.
    import heapq

    heap = []
    for a, b, ply, share, cost in buckets:
        want = max(1, int(OVERSUBSCRIBE * share / total_share))
        have = existing.get((tuple(sorted((a, b))), ply), 0) // 2
        heapq.heappush(heap, (0.0, a, b, ply, have, have, want))

    def generate():
        while heap:
            _frac, a, b, ply, i, have, want = heapq.heappop(heap)
            yield (a, b, ply, i, hash((a, b, ply, i)) & 0x7FFFFFFF)
            if i + 1 - have < want:
                heapq.heappush(
                    heap, ((i + 1 - have) / want, a, b, ply, i + 1, have, want))

    return generate()


# ─── Summary ─────────────────────────────────────────────────────────────

def summary():
    if not os.path.exists(DB_PATH):
        print('No corpus yet.')
        return
    conn = sqlite3.connect(DB_PATH)
    games = conn.execute('SELECT COUNT(*) FROM games').fetchone()[0]
    if not games:
        print('Corpus is empty.')
        return
    plies = conn.execute('SELECT COUNT(*) FROM moves').fetchone()[0]
    size = os.path.getsize(DB_PATH)
    print('games: %d   plies: %d   size: %.2f GB   %.1f bytes/ply'
          % (games, plies, size / 1e9, size / max(plies, 1)))

    print('\nterminations:')
    for term, n in conn.execute(
            'SELECT termination, COUNT(*) FROM games GROUP BY 1 ORDER BY 2 DESC'):
        print('  %-18s %8d  %5.1f%%' % (term, n, 100 * n / games))

    print('\nwinner:')
    for winner, n in conn.execute(
            'SELECT winner, COUNT(*) FROM games GROUP BY 1 ORDER BY 2 DESC'):
        print('  %-18s %8d  %5.1f%%' % (winner, n, 100 * n / games))

    print('\nseed ply coverage:')
    for ply, n, distinct in conn.execute(
            'SELECT seed_ply, COUNT(*), COUNT(DISTINCT seed_occ || ":" || '
            'seed_white || ":" || seed_rok || ":" || seed_stm) '
            'FROM games GROUP BY 1 ORDER BY 1'):
        print('  ply %2d: %8d games from %6d distinct positions' % (ply, n, distinct))

    print('\nunique full games: ', end='')
    dup = conn.execute('''
        SELECT COUNT(*), COUNT(DISTINCT sig) FROM (
            SELECT game_id, GROUP_CONCAT(move) AS sig FROM moves GROUP BY game_id)
    ''').fetchone()
    print('%d of %d (%.2f%% duplicate lines)'
          % (dup[1], dup[0], 100 * (1 - dup[1] / max(dup[0], 1))))
    conn.close()


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--hours', type=float, default=20.0,
                        help='wall-clock budget; the schedule is sized to fit')
    parser.add_argument('--workers', type=int, default=DEFAULT_WORKERS,
                        help='parallel workers (default: %d%% of cores)'
                             % int(CORE_FRACTION * 100))
    parser.add_argument('--summary', action='store_true')
    args = parser.parse_args()

    if args.summary:
        summary()
        return

    tiers, configs, elo = load_ladder()
    print('tiers from measured Elo: %s'
          % ', '.join('%s=%.0f' % (t, elo[t]) for t in tiers), flush=True)

    conn = init_db()
    existing = existing_buckets(conn)
    tasks = build_schedule(tiers, configs, existing, args.hours, args.workers)
    deadline = time.perf_counter() + args.hours * 3600
    already = sum(existing.values())
    print('workers: %d of %d cores   budget: %.1f h   '
          '(the run stops at its deadline, not at a game count)'
          % (args.workers, os.cpu_count() or 0, args.hours), flush=True)
    if already:
        print('resuming: %d games already in the corpus' % already, flush=True)

    print('pre-computing seed positions...', flush=True)
    seeds = build_seeds()
    for ply in sorted(seeds):
        print('  ply %2d: %d distinct seeds' % (ply, len(seeds[ply])), flush=True)

    t0 = time.perf_counter()
    done = 0
    last_report = 0
    buffer = []
    stopped_early = False

    # Submit in a bounded window rather than handing the whole (effectively
    # unbounded) task stream to executor.map, which would create every future
    # up front and stall before playing a single game.
    from concurrent.futures import FIRST_COMPLETED, wait
    window = args.workers * 8

    executor = ProcessPoolExecutor(max_workers=args.workers,
                                   initializer=_init_worker,
                                   initargs=(configs, seeds))
    try:
        pending = set()
        exhausted = False
        while True:
            while not exhausted and len(pending) < window:
                try:
                    pending.add(executor.submit(play_task, next(tasks)))
                except StopIteration:
                    exhausted = True
            if not pending:
                break

            finished, pending = wait(pending, return_when=FIRST_COMPLETED)
            for future in finished:
                pair = future.result()
                buffer.extend(pair)
                done += len(pair)
            if len(buffer) >= BATCH:
                flush(conn, buffer)
                buffer = []
            if done - last_report >= 2000:
                last_report = done
                elapsed = time.perf_counter() - t0
                remaining_s = max(0, deadline - time.perf_counter())
                print('  %d games  %.1f games/s  %s elapsed  %s left'
                      % (done, done / elapsed,
                         timedelta(seconds=int(elapsed)),
                         timedelta(seconds=int(remaining_s))), flush=True)
            if time.perf_counter() >= deadline:
                stopped_early = True
                break
    finally:
        if buffer:
            flush(conn, buffer)
        # Do not wait for in-flight work when the deadline has passed; a
        # top-tier game can take 30 seconds and there are ten of them running.
        executor.shutdown(wait=not stopped_early, cancel_futures=True)
        conn.close()

    print('\n%s %d games in %s'
          % ('deadline reached after' if stopped_early else 'completed',
             done, timedelta(seconds=int(time.perf_counter() - t0))))
    summary()


if __name__ == '__main__':
    main()
