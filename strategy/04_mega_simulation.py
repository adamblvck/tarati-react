#!/usr/bin/env python3
"""04_mega_simulation.py — Run 500K AI-vs-AI games across skill tiers.

Usage:
    python3 04_mega_simulation.py               # full run (resume-safe)
    python3 04_mega_simulation.py --calibrate    # calibration only
    python3 04_mega_simulation.py --summary      # print DB summary only

Long-running usage:
    nohup python3 04_mega_simulation.py > mega_run.log 2>&1 &

Monitor progress:
    tail -f mega_run.log
    python3 -m json.tool data/mega_progress.json
"""

import os
import sys
import time
import json
import sqlite3
import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timedelta

# Ensure the engine package is importable from strategy/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.runner import play_one_game, worker as _worker


# ─── Schedule ────────────────────────────────────────────────────────────
# Each entry: (depth_a, depth_b, n_games, tier_label)
# depth_a <= depth_b. Both color orderings are played for asymmetric matchups.

SCHEDULE = [
    # --- Beginner tier ---
    (3,  3,   20_000, 'beginner'),
    (3,  6,   25_000, 'beginner'),
    (6,  6,   30_000, 'beginner'),
    # --- Intermediate tier ---
    (3,  9,   20_000, 'intermediate'),
    (6,  9,   35_000, 'intermediate'),
    (9,  9,   50_000, 'intermediate'),
    # --- Advanced tier (core competitive range) ---
    (3,  12,  15_000, 'advanced'),
    (6,  12,  25_000, 'advanced'),
    (9,  12,  50_000, 'advanced'),
    (12, 12,  60_000, 'advanced'),
    # --- Expert tier ---
    (9,  15,  20_000, 'expert'),
    (12, 15,  40_000, 'expert'),
    (15, 15,  25_000, 'expert'),
    # --- Master tier ---
    (12, 18,  15_000, 'master'),
    (15, 18,  15_000, 'master'),
    (18, 18,   8_000, 'master'),
    # --- Grandmaster tier (depth 20 — target >= 10K games) ---
    (12, 20,  17_000, 'grandmaster'),
    (15, 20,  10_000, 'grandmaster'),
    (18, 20,   8_000, 'grandmaster'),
    (20, 20,  12_000, 'grandmaster'),
]


# ─── Tiered AI search configs ────────────────────────────────────────────
# Every tier has explicit budgets. The previous run had beginner at
# max_ms=None / max_nodes=None which caused 6v6 to do unbounded depth-6
# searches at ~10s/game (vs ~100ms for 3v3). Now beginner gets caps too.

AI_CONFIGS = {
    'beginner': {
        'max_ms': 500,
        'max_nodes': 5_000,
        'root_probe_nodes': 50,
        'stochastic_top_k': 3,
    },
    'intermediate': {
        'max_ms': 2_000,
        'max_nodes': 15_000,
        'root_probe_nodes': 80,
        'stochastic_top_k': 3,
    },
    'advanced': {
        'max_ms': 5_000,
        'max_nodes': 25_000,
        'root_probe_nodes': 100,
        'stochastic_top_k': 3,
    },
    'expert': {
        'max_ms': 10_000,
        'max_nodes': 50_000,
        'root_probe_nodes': 150,
        'stochastic_top_k': 3,
    },
    'master': {
        'max_ms': 20_000,
        'max_nodes': 100_000,
        'root_probe_nodes': 200,
        'stochastic_top_k': 3,
    },
    'grandmaster': {
        'max_ms': 30_000,
        'max_nodes': 200_000,
        'root_probe_nodes': 300,
        'stochastic_top_k': 3,
    },
}

# For the 10% deterministic-opener games, also lock stochastic_top_k
# to 1 for fully deterministic best-play baselines.
DETERMINISTIC_OVERRIDE = {'stochastic_top_k': 1}


# ─── Adaptive worker counts ──────────────────────────────────────────────

CPU_COUNT = os.cpu_count() or 4

WORKER_COUNTS = {
    'beginner':     max(1, CPU_COUNT - 1),
    'intermediate': max(1, CPU_COUNT - 1),
    'advanced':     max(1, CPU_COUNT - 1),
    'expert':       max(2, CPU_COUNT // 2),
    'master':       max(2, CPU_COUNT // 3),
    'grandmaster':  max(2, CPU_COUNT // 3),
}


# ─── General settings ────────────────────────────────────────────────────

MAX_MOVES = 200
BATCH_INSERT_SIZE = 1_000
RANDOM_FRACTION = 0.90
# Max futures alive at once — limits peak memory from IPC results
SUBMISSION_CHUNK = 2_000
# Skip board_after JSON in move records (saves ~80% IPC + storage)
SKIP_BOARD_AFTER = True

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'mega_games.sqlite')
PROGRESS_PATH = os.path.join(os.path.dirname(__file__), 'data', 'mega_progress.json')


# ─── Database ─────────────────────────────────────────────────────────────

def init_mega_db(db_path):
    """Create the mega games + moves tables if they don't exist."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('''
        CREATE TABLE IF NOT EXISTS games (
            game_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            white_depth        INTEGER NOT NULL,
            black_depth        INTEGER NOT NULL,
            winner             TEXT    NOT NULL,
            total_moves        INTEGER NOT NULL,
            termination        TEXT    NOT NULL,
            duration_ms        REAL    NOT NULL,
            random_first_move  INTEGER NOT NULL DEFAULT 1,
            batch_label        TEXT    NOT NULL DEFAULT '',
            created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS moves (
            move_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id       INTEGER NOT NULL,
            move_number   INTEGER NOT NULL,
            color         TEXT    NOT NULL,
            from_vertex   TEXT    NOT NULL,
            to_vertex     TEXT    NOT NULL,
            strikes       TEXT,
            upgrades      TEXT,
            board_after   TEXT,
            FOREIGN KEY (game_id) REFERENCES games(game_id)
        )
    ''')
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_games_matchup
        ON games (white_depth, black_depth, random_first_move)
    ''')
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_moves_game
        ON moves (game_id, move_number)
    ''')
    conn.commit()
    conn.close()


def insert_game(conn, game_rec, move_recs, rfm, label):
    """Insert one game + moves. Returns game_id."""
    c = conn.cursor()
    c.execute(
        '''INSERT INTO games
           (white_depth, black_depth, winner, total_moves, termination,
            duration_ms, random_first_move, batch_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
        (game_rec['white_depth'], game_rec['black_depth'],
         game_rec['winner'], game_rec['total_moves'],
         game_rec['termination'], game_rec['duration_ms'],
         int(rfm), label),
    )
    gid = c.lastrowid
    c.executemany(
        '''INSERT INTO moves
           (game_id, move_number, color, from_vertex, to_vertex,
            strikes, upgrades, board_after)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
        [(gid, mr['move_number'], mr['color'], mr['from_vertex'],
          mr['to_vertex'], mr['strikes'], mr['upgrades'], mr['board_after'])
         for mr in move_recs],
    )
    return gid


# ─── Checkpoint / resume ─────────────────────────────────────────────────

def get_existing_counts(db_path):
    """Return {(white_depth, black_depth, random_first_move): count}."""
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        '''SELECT white_depth, black_depth, random_first_move, COUNT(*)
           FROM games
           GROUP BY white_depth, black_depth, random_first_move'''
    ).fetchall()
    conn.close()
    return {(wd, bd, rfm): cnt for wd, bd, rfm, cnt in rows}


def build_run_plan(schedule, random_fraction, existing_counts):
    """Build sub-batches with remaining game counts after deducting DB entries."""
    plan = []
    for depth_a, depth_b, n_games, tier in schedule:
        n_random = int(n_games * random_fraction)
        n_determ = n_games - n_random

        for rfm, sub_n in [(True, n_random), (False, n_determ)]:
            if sub_n <= 0:
                continue
            label = f'{depth_a}v{depth_b}_{tier}'

            if depth_a == depth_b:
                key = (depth_a, depth_b, int(rfm))
                remaining = max(0, sub_n - existing_counts.get(key, 0))
                if remaining > 0:
                    plan.append({
                        'depth_a': depth_a, 'depth_b': depth_b,
                        'n_games': remaining, 'tier': tier,
                        'label': label, 'random_first_move': rfm,
                    })
            else:
                half_1 = sub_n // 2
                half_2 = sub_n - half_1
                for da, db, target, lbl_suffix in [
                    (depth_a, depth_b, half_1, ''),
                    (depth_b, depth_a, half_2, '_flip'),
                ]:
                    key = (da, db, int(rfm))
                    remaining = max(0, target - existing_counts.get(key, 0))
                    if remaining > 0:
                        plan.append({
                            'depth_a': da, 'depth_b': db,
                            'n_games': remaining, 'tier': tier,
                            'label': label + lbl_suffix,
                            'random_first_move': rfm,
                        })
    return plan


# ─── Batch runner (chunked submission, no result accumulation) ────────────

def run_batch(batch, db_path):
    """Run one sub-batch with chunked future submission and streaming DB writes.

    Key differences from the notebook version:
    - Futures submitted in chunks of SUBMISSION_CHUNK (not all at once)
    - Game records NOT accumulated in a list — summary comes from DB afterward
    - skip_board_after passed to workers to cut ~80% of IPC payload
    """
    da = batch['depth_a']
    db_ = batch['depth_b']
    n_games = batch['n_games']
    tier = batch['tier']
    label = batch['label']
    rfm = batch['random_first_move']

    cfg = dict(AI_CONFIGS[tier])
    if not rfm:
        cfg.update(DETERMINISTIC_OVERRIDE)
    ai_kwargs = dict(cfg)

    num_workers = WORKER_COUNTS[tier]
    rfm_tag = 'random' if rfm else 'determ'

    conn = sqlite3.connect(db_path)
    insert_buf = []
    games_done = 0
    wins = {'WHITE': 0, 'BLACK': 0, 'DRAW': 0}
    total_moves_sum = 0
    t0 = time.perf_counter()

    def flush_buffer():
        nonlocal insert_buf
        for gr, mr in insert_buf:
            insert_game(conn, gr, mr, rfm, label)
        conn.commit()
        insert_buf = []

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        # Process in chunks to cap peak memory from pending futures / results
        for chunk_start in range(0, n_games, SUBMISSION_CHUNK):
            chunk_end = min(chunk_start + SUBMISSION_CHUNK, n_games)
            futures = {}
            for i in range(chunk_start, chunk_end):
                task = (da, db_, MAX_MOVES, i, ai_kwargs, ai_kwargs,
                        rfm, SKIP_BOARD_AFTER)
                futures[executor.submit(_worker, task)] = True

            for future in as_completed(futures):
                game_rec, move_recs = future.result()
                insert_buf.append((game_rec, move_recs))
                games_done += 1
                wins[game_rec['winner']] = wins.get(game_rec['winner'], 0) + 1
                total_moves_sum += game_rec['total_moves']

                if len(insert_buf) >= BATCH_INSERT_SIZE:
                    flush_buffer()

                # Progress print every 500 games
                if games_done % 500 == 0:
                    elapsed = time.perf_counter() - t0
                    rate = games_done / elapsed if elapsed > 0 else 0
                    eta = (n_games - games_done) / rate if rate > 0 else 0
                    print(f'\r  {label} [{rfm_tag}]: '
                          f'{games_done:,}/{n_games:,} '
                          f'({games_done/n_games*100:.0f}%) '
                          f'{rate:.1f} games/s  '
                          f'ETA {timedelta(seconds=int(eta))}',
                          end='', flush=True)

    flush_buffer()
    conn.close()

    elapsed = time.perf_counter() - t0
    avg_moves = total_moves_sum / games_done if games_done else 0
    win_str = ', '.join(f'{k}: {v}' for k, v in sorted(wins.items()) if v > 0)
    print(f'\r  {label} [{rfm_tag}]: '
          f'{games_done:,}/{n_games:,} done in {elapsed:.1f}s — '
          f'{win_str}, avg {avg_moves:.1f} moves'
          + ' ' * 20)

    return {'label': label, 'n_games': games_done, 'elapsed_s': elapsed, 'tier': tier}


# ─── Calibration ──────────────────────────────────────────────────────────

def calibrate():
    """Test the SLOWEST matchup per tier (not the fastest) for honest estimates."""
    print('Calibrating per-tier speed (10 games each, worst-case matchup)...\n')

    # Pick the highest-depth matchup per tier — that's the actual bottleneck
    tier_worst = {}
    for da, db, _n, tier in SCHEDULE:
        worst_sum = tier_worst.get(tier, (0, 0, 0))[2]
        if da + db >= worst_sum:
            tier_worst[tier] = (da, db, da + db)

    total_est = 0.0
    for tier, (da, db, _) in tier_worst.items():
        cfg = AI_CONFIGS[tier]
        t0 = time.perf_counter()
        for i in range(10):
            play_one_game(da, db, max_moves=MAX_MOVES, seed=i,
                          white_ai_kwargs=cfg, black_ai_kwargs=cfg,
                          random_first_move=True, skip_board_after=SKIP_BOARD_AFTER)
        avg_ms = (time.perf_counter() - t0) / 10 * 1000

        tier_total = sum(n for _, _, n, t in SCHEDULE if t == tier)
        workers = WORKER_COUNTS[tier]
        est_hrs = (avg_ms * tier_total) / (1000 * 3600 * workers)
        total_est += est_hrs

        print(f'  {tier:15s}  {da:>2}v{db:<2}  '
              f'avg {avg_ms:>8,.0f} ms/game  '
              f'{tier_total:>7,} games  '
              f'~{est_hrs:>6.1f} hrs ({workers} workers)')

    print(f'\n  Estimated total wall-clock: ~{total_est:.1f} hours')
    print(f'  (based on worst-case matchup per tier; actual blend will be faster)')


# ─── Summary from DB ──────────────────────────────────────────────────────

def print_summary():
    """Print summary statistics directly from the database."""
    if not os.path.exists(DB_PATH):
        print('No database found.')
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    game_count = c.execute('SELECT COUNT(*) FROM games').fetchone()[0]
    move_count = c.execute('SELECT COUNT(*) FROM moves').fetchone()[0]
    if game_count == 0:
        print('Database is empty.')
        conn.close()
        return

    db_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    print('\n' + '=' * 65)
    print('MEGA DATABASE SUMMARY')
    print('=' * 65)
    print(f'  Total games:   {game_count:>10,}')
    print(f'  Total moves:   {move_count:>10,}')
    print(f'  Database size: {db_mb:>10.1f} MB')

    print('\nWin distribution:')
    for row in c.execute('SELECT winner, COUNT(*) FROM games GROUP BY winner'):
        pct = row[1] / game_count * 100
        print(f'  {row[0]:6s}: {row[1]:>8,} ({pct:.1f}%)')

    print('\nTermination reasons:')
    for row in c.execute('SELECT termination, COUNT(*) FROM games GROUP BY termination'):
        print(f'  {row[0]:20s}: {row[1]:>8,}')

    print('\nRandom vs Deterministic first move:')
    for row in c.execute(
        '''SELECT random_first_move, COUNT(*), ROUND(AVG(total_moves),1)
           FROM games GROUP BY random_first_move'''
    ):
        tag = 'Random' if row[0] else 'Deterministic'
        print(f'  {tag:15s}: {row[1]:>8,} games, avg {row[2]} moves')

    print('\nPer-matchup breakdown:')
    print(f'  {"matchup":>8s}  {"rfm":>5s}  {"games":>8s}  {"W wins":>7s}  '
          f'{"B wins":>7s}  {"draws":>6s}  {"avg_ms":>8s}  {"avg_mv":>6s}')
    for row in c.execute(
        '''SELECT white_depth, black_depth, random_first_move,
                  COUNT(*),
                  SUM(CASE WHEN winner='WHITE' THEN 1 ELSE 0 END),
                  SUM(CASE WHEN winner='BLACK' THEN 1 ELSE 0 END),
                  SUM(CASE WHEN winner='DRAW' THEN 1 ELSE 0 END),
                  ROUND(AVG(duration_ms),0), ROUND(AVG(total_moves),1)
           FROM games
           GROUP BY white_depth, black_depth, random_first_move
           ORDER BY white_depth, black_depth'''
    ):
        wd, bd, rfm, n, ww, bw, dr, ms, mv = row
        print(f'  {wd:>2}v{bd:<2}     {rfm:>3}  {n:>8,}  {ww:>7,}  '
              f'{bw:>7,}  {dr:>6,}  {ms:>8.0f}  {mv:>6.1f}')

    conn.close()


# ─── Main ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Mega 500K game simulation')
    parser.add_argument('--calibrate', action='store_true',
                        help='Run calibration only (no games)')
    parser.add_argument('--summary', action='store_true',
                        help='Print DB summary only')
    args = parser.parse_args()

    print(f'CPU count: {CPU_COUNT}')
    print(f'DB path:   {DB_PATH}')
    print(f'Skip board_after: {SKIP_BOARD_AFTER}')
    print(f'Submission chunk: {SUBMISSION_CHUNK}')
    print(f'Batch insert size: {BATCH_INSERT_SIZE}')
    for tier, wc in WORKER_COUNTS.items():
        print(f'  {tier:15s} workers: {wc}')

    total_scheduled = sum(n for _, _, n, _ in SCHEDULE)
    depth_20_games = sum(n for a, b, n, _ in SCHEDULE if a == 20 or b == 20)
    print(f'\nTotal scheduled: {total_scheduled:,} games')
    print(f'Depth-20 games:  {depth_20_games:,}')

    if args.summary:
        print_summary()
        return

    if args.calibrate:
        calibrate()
        return

    # --- Smoke test ---
    print('\nSmoke test (depth 3 vs 3)...')
    g, _ = play_one_game(3, 3, seed=42,
                         white_ai_kwargs=AI_CONFIGS['beginner'],
                         black_ai_kwargs=AI_CONFIGS['beginner'],
                         random_first_move=True, skip_board_after=True)
    print(f'  {g["winner"]}, {g["total_moves"]} moves, '
          f'{g["termination"]}, {g["duration_ms"]:.0f}ms — OK')

    # --- Init DB + checkpoint ---
    init_mega_db(DB_PATH)
    existing = get_existing_counts(DB_PATH)
    run_plan = build_run_plan(SCHEDULE, RANDOM_FRACTION, existing)

    total_remaining = sum(b['n_games'] for b in run_plan)
    total_done = total_scheduled - total_remaining
    print(f'\nAlready in DB: {total_done:>10,}')
    print(f'Remaining:     {total_remaining:>10,}')
    print(f'Sub-batches:   {len(run_plan):>10}')

    if total_remaining == 0:
        print('\nAll games already completed!')
        print_summary()
        return

    # --- Main loop ---
    batch_timings = []
    run_start = time.perf_counter()
    print(f'\nStarting at {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('=' * 65)

    for idx, batch in enumerate(run_plan):
        rfm_tag = 'random' if batch['random_first_move'] else 'determ'
        print(f'\n[{idx+1}/{len(run_plan)}] '
              f'{batch["label"]} ({batch["depth_a"]}v{batch["depth_b"]}) '
              f'{batch["n_games"]:,} games [{rfm_tag}] '
              f'— {WORKER_COUNTS[batch["tier"]]} workers')

        timing = run_batch(batch, DB_PATH)
        batch_timings.append(timing)

        # ETA
        elapsed = time.perf_counter() - run_start
        done_so_far = sum(t['n_games'] for t in batch_timings)
        if done_so_far < total_remaining:
            rate = elapsed / done_so_far
            eta = rate * (total_remaining - done_so_far)
            print(f'  Overall: {done_so_far:,}/{total_remaining:,} '
                  f'({done_so_far/total_remaining*100:.1f}%) — '
                  f'ETA {timedelta(seconds=int(eta))}')

        # Progress checkpoint
        progress = {
            'last_updated': datetime.now().isoformat(),
            'total_scheduled': total_scheduled,
            'total_remaining_at_start': total_remaining,
            'games_completed_this_run': done_so_far,
            'batches_completed': idx + 1,
            'batches_total': len(run_plan),
            'elapsed_seconds': elapsed,
        }
        with open(PROGRESS_PATH, 'w') as f:
            json.dump(progress, f, indent=2)

    elapsed = time.perf_counter() - run_start
    print('\n' + '=' * 65)
    print(f'Mega simulation complete!')
    print(f'Games this run:  {sum(t["n_games"] for t in batch_timings):,}')
    print(f'Total time:      {timedelta(seconds=int(elapsed))}')
    print(f'Finished at:     {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')

    print_summary()


if __name__ == '__main__':
    main()
