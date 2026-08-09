#!/usr/bin/env python3
"""10_engine_lab.py — measure candidate engines before adopting any of them.

The shipped ladder tops out at a measured 1,094 Elo. A strategy guide cannot
credibly describe play above its oracle's own strength, so writing 1200-1800
material needs a stronger oracle first. This script is the search for one.

Four things are measured, in increasing cost:

1. **Parity** — the `base` variant must choose the same moves as the shipped
   `ai.py` at fixed depth. If it does not, every later number is measuring a
   bug rather than an idea.
2. **Cost** — nodes and milliseconds to complete each depth. An idea that wins
   at equal *depth* but costs 4x the nodes has not won anything.
3. **Tactics** — accuracy on positions where a deep reference search finds a
   move worth more than a piece over the runner-up. This is where quiescence
   should show up first, and it is cheap compared to a gauntlet.
4. **Gauntlet** — colour-balanced games against `base` at an equal *node*
   budget, from distinct ply-4 openings, scored as Elo with a Wilson interval.

Equal node budgets, not equal depth: the browser ships a node budget, so
strength per node is the quantity that transfers.

    ./venv/bin/python 10_engine_lab.py --stage all --games 200

Results land in data/engine_lab.json and are resumable per variant.
"""

import argparse
import json
import math
import os
import random
import sys
import time
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb
from engine import ai
from engine import search2
from engine.openings import frontier_sample

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
OUT = os.path.join(DATA_DIR, 'engine_lab.json')

MAX_PLIES = 160
OPENING_PLY = 4
WORKERS = max(2, (os.cpu_count() or 4) - 2)

#: Champion's shipped budget. Every gauntlet game gives both sides exactly this,
#: so a variant can only win by spending it better.
NODE_BUDGET = 250_000
GAUNTLET_DEPTH = 24          # never reached; the node budget is what binds


def load():
    if os.path.exists(OUT):
        with open(OUT) as fh:
            return json.load(fh)
    return {'cost': {}, 'tactics': {}, 'gauntlet': {}}


def save(results):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT, 'w') as fh:
        json.dump(results, fh, indent=2)


def wilson(k, n):
    if n == 0:
        return 0.0, (0.0, 0.0)
    p, z = k / n, 1.959964
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, (max(0.0, centre - half), min(1.0, centre + half))


def elo(p):
    """Elo difference implied by a score rate. Clamped at the ends."""
    p = min(max(p, 1e-4), 1 - 1e-4)
    return 400 * math.log10(p / (1 - p))


# ─── Stage 1: parity with the shipped engine ─────────────────────────────

def stage_parity(depth=6, n=120):
    """`base` must reproduce `ai.py`'s choice, or the experiment is measuring
    an accident. Scores must match too: a variant that agrees on the move but
    not the value would still corrupt the loss statistics the guide is built on.
    """
    boards = [bb.from_state(s) for s in
              frontier_sample(OPENING_PLY, n, random.Random(1))]
    engine = search2.make('base')
    move_ok = score_ok = 0
    for occ, white, rok, stm in boards:
        ref = ai.search_root(occ, white, rok, stm, depth=depth, randomize=False,
                             temperature=0.0, use_tt=True)
        got = engine.search_root(occ, white, rok, stm, depth=depth)
        move_ok += (ref[0] == got[0])
        score_ok += (dict(ref[1]).get(ref[0]) == dict(got[1]).get(got[0]))
    print(f"parity at depth {depth} over {len(boards)} positions: "
          f"same move {move_ok}/{len(boards)}, same score {score_ok}/{len(boards)}")
    return move_ok == len(boards) and score_ok == len(boards)


# ─── Stage 2: cost per depth ─────────────────────────────────────────────

def stage_cost(variants, depth=10, n=24):
    """Nodes and wall-clock to complete each depth, averaged over positions."""
    boards = [bb.from_state(s) for s in
              frontier_sample(OPENING_PLY, n, random.Random(2))]
    out = {}
    for name in variants:
        engine = search2.make(name)
        nodes = t0 = 0
        start = time.perf_counter()
        for b in boards:
            engine.search_root(*b, depth=depth, max_nodes=4_000_000)
            nodes += engine.nodes
        elapsed = time.perf_counter() - start
        out[name] = {
            'depth': depth,
            'mean_nodes': nodes / len(boards),
            'mean_ms': elapsed * 1000 / len(boards),
            'nodes_per_sec': nodes / max(elapsed, 1e-9),
        }
        print(f"  {name:11s} depth {depth}: {out[name]['mean_nodes']:>10,.0f} nodes  "
              f"{out[name]['mean_ms']:>8.1f} ms  "
              f"{out[name]['nodes_per_sec']:>10,.0f} n/s")
    return out


# ─── Stage 3: tactical suite ─────────────────────────────────────────────

SUITE_PATH = os.path.join(DATA_DIR, 'tactics_suite.json')
REF_DEPTH = 14
REF_NODES = 600_000
SAMPLE_EVERY = 7          # plies between candidate positions within one walk


def _walk(task):
    """One semi-random game, scoring every seventh position with the reference.

    Sampling along a walk rather than from a frontier enumeration is what makes
    the suite span phases: an enumeration at fixed ply only ever produces
    openings, and the guide's own blunder map says the endgame is where even
    strong play breaks down.
    """
    index, start, gap, seed = task
    rng = random.Random(seed)
    ref = search2.make('full')
    occ, white, rok, stm = start
    found = []

    for ply in range(MAX_PLIES):
        moves = bb.gen_moves(occ, white, rok, stm)
        if not moves:
            break
        if ply >= 4 and ply % SAMPLE_EVERY == 0 and len(moves) > 3:
            _m, scored, _d = ref.search_root(occ, white, rok, stm,
                                             depth=REF_DEPTH,
                                             max_nodes=REF_NODES)
            if len(scored) > 1 and scored[0][1] - scored[1][1] > gap:
                found.append({
                    'pos': [occ, white, rok, stm],
                    'best': scored[0][0],
                    'gap': scored[0][1] - scored[1][1],
                    'ply': ply,
                })
        # Mostly-good play, so the walk stays on plausible ground rather than
        # wandering into positions no real game reaches.
        move = rng.choice(moves[:3]) if rng.random() < 0.7 else rng.choice(moves)
        occ, white, rok, stm = bb.make_move(occ, white, rok, stm, move)
    return found


def build_tactics(count=200, gap=100, seed=3, walks=64, cache=True):
    """Positions with one clearly best move, found by a deep reference search.

    A position qualifies when the best move beats the runner-up by more than a
    whole piece at depth 14. That is a move a 1200-1800 player is expected to
    find and a shallow search is expected to miss, which makes the suite a
    direct proxy for the strength the guide wants to describe.
    """
    if cache and os.path.exists(SUITE_PATH):
        with open(SUITE_PATH) as fh:
            suite = json.load(fh)
        if len(suite) >= count:
            return suite[:count]

    starts = [bb.from_state(s) for s in
              frontier_sample(OPENING_PLY, walks, random.Random(seed))]
    tasks = [(i, s, gap, seed * 1013 + i) for i, s in enumerate(starts)]

    suite, seen = [], set()
    with ProcessPoolExecutor(max_workers=WORKERS) as pool:
        for batch in pool.map(_walk, tasks, chunksize=1):
            for case in batch:
                key = tuple(case['pos'])
                if key not in seen:
                    seen.add(key)
                    suite.append(case)
            print(f"    {len(suite)} positions from {len(seen)} distinct",
                  flush=True)
            if len(suite) >= count:
                break

    with open(SUITE_PATH, 'w') as fh:
        json.dump(suite, fh)
    return suite[:count]


def stage_tactics(variants, suite, budget=25_000):
    out = {}
    for name in variants:
        engine = search2.make(name)
        hit = 0
        for case in suite:
            occ, white, rok, stm = case['pos']
            m, _s, _d = engine.search_root(occ, white, rok, stm,
                                           depth=GAUNTLET_DEPTH,
                                           max_nodes=budget)
            hit += (m == case['best'])
        p, ci = wilson(hit, len(suite))
        out[name] = {'hit': hit, 'n': len(suite), 'rate': p, 'ci': list(ci)}
        print(f"  {name:11s} {hit:3d}/{len(suite)}  {p:6.1%}  "
              f"[{ci[0]:.1%}, {ci[1]:.1%}]")
    return out


# ─── Stage 4: gauntlet ───────────────────────────────────────────────────

_OPENINGS = None


def openings(count):
    global _OPENINGS
    if _OPENINGS is None:
        _OPENINGS = [bb.from_state(s) for s in
                     frontier_sample(OPENING_PLY, count, random.Random(20260727),
                                     mirror_balanced=True)]
    return _OPENINGS


def play(white_engine, black_engine, start, seed, budget):
    """One game between two engines. Returns 'WHITE' | 'BLACK' | 'DRAW'."""
    rng = random.Random(seed)
    occ, white, rok, stm = start
    reps = {bb.zobrist(occ, white, rok, stm): 1}
    quiet = 0

    for _ in range(MAX_PLIES):
        loser = bb.terminal_loser(occ, white, rok, stm)
        if loser is not None:
            return 'WHITE' if loser == bb.BLACK else 'BLACK'
        engine = white_engine if stm == bb.WHITE else black_engine
        move, _s, _d = engine.search_root(occ, white, rok, stm,
                                          depth=GAUNTLET_DEPTH,
                                          max_nodes=budget, rng=rng)
        if move is None:
            break
        was_cob = not ((rok >> (move >> 5)) & 1)
        rok_before = rok
        occ, white, rok, stm = bb.make_move(occ, white, rok, stm, move)
        quiet = 0 if (was_cob or rok != rok_before) else quiet + 1
        key = bb.zobrist(occ, white, rok, stm)
        reps[key] = reps.get(key, 0) + 1
        if reps[key] >= 3 or quiet >= 100:
            return 'DRAW'
    return 'DRAW'


def _game(task):
    name, index, variant_is_white, n_openings, budget, baseline_name = task
    challenger = search2.make(name)
    baseline = search2.make(baseline_name)
    start = openings(n_openings)[index % n_openings]
    w, b = ((challenger, baseline) if variant_is_white
            else (baseline, challenger))
    winner = play(w, b, start, index * 7919 + int(variant_is_white), budget)
    if winner == 'DRAW':
        return name, 0.5
    return name, 1.0 if (winner == 'WHITE') == variant_is_white else 0.0


def stage_gauntlet(variants, games, budget, results, baseline='base'):
    """Each variant plays `games` colour-balanced games against `baseline`.

    Colour balance matters here: the two sides are mirror images under the
    board's 180 degree automorphism, so any aggregate colour skew in a fair
    sample is a bug rather than a result, and an unbalanced sample would hide
    that check.
    """
    key = f'{baseline}@{budget}'
    bucket = results['gauntlet'].setdefault(key, {})
    n_openings = max(8, games // 2)
    openings(n_openings)
    tasks = []
    for name in variants:
        if name == baseline or name in bucket:
            continue
        for i in range(games):
            tasks.append((name, i, i % 2 == 0, n_openings, budget, baseline))
    if not tasks:
        return bucket

    scores = {name: [] for name in variants}
    done = 0
    with ProcessPoolExecutor(max_workers=WORKERS) as pool:
        for name, score in pool.map(_game, tasks, chunksize=1):
            scores[name].append(score)
            done += 1
            if done % 20 == 0:
                print(f"    {done}/{len(tasks)} games", flush=True)

    for name, values in scores.items():
        if not values:
            continue
        total = sum(values)
        p, ci = wilson(total, len(values))
        bucket[name] = {
            'games': len(values), 'score': total, 'rate': p,
            'ci': list(ci), 'elo': elo(p),
            'elo_ci': [elo(ci[0]), elo(ci[1])],
            'budget': budget, 'baseline': baseline,
        }
        print(f"  {name:11s} {total:6.1f}/{len(values)}  {p:6.1%}  "
              f"Elo {elo(p):+7.1f} [{elo(ci[0]):+.0f}, {elo(ci[1]):+.0f}]")
    return bucket


# ─── Entry point ─────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', default='all',
                    choices=['all', 'parity', 'cost', 'tactics', 'gauntlet'])
    ap.add_argument('--games', type=int, default=120)
    ap.add_argument('--budget', type=int, default=NODE_BUDGET)
    ap.add_argument('--variants', default=','.join(search2.VARIANTS))
    ap.add_argument('--baseline', default='base',
                    help='opponent for the gauntlet; use a winning variant to '
                         'separate two candidates that both beat `base`')
    ap.add_argument('--fresh', action='store_true')
    args = ap.parse_args()

    variants = [v.strip() for v in args.variants.split(',') if v.strip()]
    results = {'cost': {}, 'tactics': {}, 'gauntlet': {}} if args.fresh else load()

    if args.stage in ('all', 'parity'):
        print("\n[1] parity with the shipped engine")
        if not stage_parity():
            print("    FAILED — `base` does not reproduce ai.py; stopping.")
            return 1

    if args.stage in ('all', 'cost'):
        print("\n[2] cost per depth")
        results['cost'] = stage_cost(variants)
        save(results)

    if args.stage in ('all', 'tactics'):
        print("\n[3] tactical suite")
        suite = build_tactics()
        print(f"    built {len(suite)} positions with a >1 piece gap")
        results['tactics'] = stage_tactics(variants, suite)
        results['tactics']['_suite_size'] = len(suite)
        save(results)

    if args.stage in ('all', 'gauntlet'):
        print(f"\n[4] gauntlet vs {args.baseline}, {args.games} games at "
              f"{args.budget:,} nodes/move")
        stage_gauntlet(variants, args.games, args.budget, results,
                       baseline=args.baseline)
        save(results)

    print(f"\nwritten to {OUT}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
