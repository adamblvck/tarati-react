#!/usr/bin/env python3
"""05_calibrate_ladder.py — measure the strength ladder instead of assuming it.

The previous corpus defined difficulty as nominal search depth and never
checked it. It was wrong: depths 12/15/18/20 turned out to be a single player
(identical move in 60/60 sampled positions) and depth 9 scored 22% against
depth 6. Tier labels like "grandmaster" described nothing.

This script plays a colour-balanced round robin between candidate engine
configurations, fits Bradley-Terry ratings on the results, and reports Elo with
bootstrap confidence intervals. Tier names are assigned from measured Elo
afterwards — never from depth.

Run under PyPy, which is roughly 3x faster than CPython here:

    pypy3.11 05_calibrate_ladder.py --games 24
    pypy3.11 05_calibrate_ladder.py --report        # refit from saved results

Results are checkpointed per pairing, so the run is resumable.
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

from engine.openings import frontier_sample
from engine.runner import play_one_game

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
RESULTS_PATH = os.path.join(DATA_DIR, 'ladder_results.json')
LADDER_PATH = os.path.join(DATA_DIR, 'ladder.json')

# ─── Candidate configurations ────────────────────────────────────────────
# Every config carries an explicit node budget so that cost per move is
# bounded and the same settings can be shipped to the browser. Weakness is
# produced two ways deliberately: a shallower search, and a wider softmax
# temperature (plus, at the bottom, an outright blunder rate). Temperature is
# in centipieces, so 100 == one whole piece of tolerated loss.

CONFIGS = [
    # key      depth  max_nodes  temperature  blunder_rate
    ('L1',        2,       400,        160.0,        0.20),
    ('L2',        3,     1_000,        110.0,        0.10),
    ('L3',        4,     2_500,         70.0,        0.03),
    ('L4',        5,     6_000,         40.0,        0.00),
    ('L5',        6,    15_000,         20.0,        0.00),
    ('L6',        8,    40_000,          0.0,        0.00),
    ('L7',       10,   100_000,          0.0,        0.00),
    ('L8',       12,   250_000,          0.0,        0.00),
]

MAX_MOVES = 160
OPENING_PLY = 4          # each game starts from a distinct ply-4 position
WORKERS = max(2, (os.cpu_count() or 4) - 2)


def config_kwargs(entry):
    _key, depth, max_nodes, temperature, blunder = entry
    return {
        'max_nodes': max_nodes,
        'temperature': temperature,
        'stochastic_top_k': 4 if temperature else 1,
        # Per-side: the runner pops this out so a weak config's handicap is
        # never applied to its opponent.
        'blunder_rate': blunder,
    }


def config_depth(entry):
    return entry[1]


def config_blunder(entry):
    return entry[4]


BY_KEY = {entry[0]: entry for entry in CONFIGS}


# ─── Match play ──────────────────────────────────────────────────────────

_OPENINGS = None


def openings(count):
    global _OPENINGS
    if _OPENINGS is None:
        # Mirror-balanced so the aggregate White score is interpretable.
        _OPENINGS = frontier_sample(OPENING_PLY, count, random.Random(20260722),
                                    mirror_balanced=True)
    return _OPENINGS


def play_pairing(task):
    """One game. Returns (a_key, b_key, score_for_a)."""
    a_key, b_key, index, a_is_white, n_openings = task
    a_cfg, b_cfg = BY_KEY[a_key], BY_KEY[b_key]
    board = openings(n_openings)[index % n_openings]

    white_cfg, black_cfg = (a_cfg, b_cfg) if a_is_white else (b_cfg, a_cfg)
    record, _ = play_one_game(
        config_depth(white_cfg), config_depth(black_cfg),
        max_moves=MAX_MOVES,
        seed=index * 7919 + (0 if a_is_white else 1),
        white_ai_kwargs=config_kwargs(white_cfg),
        black_ai_kwargs=config_kwargs(black_cfg),
        start_state=board,
        skip_board_after=True,
    )

    if record['winner'] == 'DRAW':
        score = 0.5
    elif (record['winner'] == 'WHITE') == a_is_white:
        score = 1.0
    else:
        score = 0.0
    white_score = 0.5 if record['winner'] == 'DRAW' else (1.0 if record['winner'] == 'WHITE' else 0.0)
    return a_key, b_key, score, white_score, record['termination'], record['total_moves']


# ─── Bradley-Terry / Elo fitting ─────────────────────────────────────────

def fit_elo(pair_scores, iterations=800):
    """Minorization-maximization fit of Bradley-Terry strengths.

    `pair_scores` maps (a, b) -> (score_a, games). Draws count as half a win to
    each side, the standard reduction. Written in plain Python so the whole
    script runs under PyPy without numpy.
    """
    keys = sorted({k for pair in pair_scores for k in pair})
    strength = {k: 1.0 for k in keys}

    wins = {k: 0.0 for k in keys}
    games = {k: {} for k in keys}
    for (a, b), (score_a, n) in pair_scores.items():
        wins[a] += score_a
        wins[b] += n - score_a
        games[a][b] = games[a].get(b, 0) + n
        games[b][a] = games[b].get(a, 0) + n

    for _ in range(iterations):
        updated = {}
        for k in keys:
            denom = 0.0
            for opp, n in games[k].items():
                denom += n / (strength[k] + strength[opp])
            updated[k] = (wins[k] / denom) if denom > 0 and wins[k] > 0 else strength[k] * 1e-3
        # Normalise to keep the scale anchored and the iteration stable.
        geo = math.exp(sum(math.log(v) for v in updated.values()) / len(updated))
        strength = {k: v / geo for k, v in updated.items()}

    return {k: 400.0 * math.log10(v) for k, v in strength.items()}


def bootstrap_elo(games_list, rounds=200, seed=7):
    """Percentile confidence intervals by resampling whole games."""
    rng = random.Random(seed)
    samples = {}
    n = len(games_list)
    for _ in range(rounds):
        pair_scores = {}
        for _ in range(n):
            a, b, score, *_rest = games_list[rng.randrange(n)]
            key = (a, b)
            prev_score, prev_n = pair_scores.get(key, (0.0, 0))
            pair_scores[key] = (prev_score + score, prev_n + 1)
        try:
            elo = fit_elo(pair_scores, iterations=200)
        except (ZeroDivisionError, ValueError):
            continue
        for k, v in elo.items():
            samples.setdefault(k, []).append(v)

    out = {}
    for k, values in samples.items():
        values.sort()
        lo = values[int(0.025 * len(values))]
        hi = values[int(0.975 * len(values)) - 1]
        out[k] = (lo, hi)
    return out


# ─── Reporting and gates ─────────────────────────────────────────────────

def report(games_list):
    pair_scores = {}
    white_total = 0.0
    terminations = {}
    move_total = 0
    for a, b, score, white_score, termination, moves in games_list:
        key = (a, b)
        prev_score, prev_n = pair_scores.get(key, (0.0, 0))
        pair_scores[key] = (prev_score + score, prev_n + 1)
        white_total += white_score
        terminations[termination] = terminations.get(termination, 0) + 1
        move_total += moves

    elo = fit_elo(pair_scores)
    cis = bootstrap_elo(games_list)

    order = sorted(elo, key=lambda k: elo[k])
    base = elo[order[0]]

    print('\n' + '=' * 72)
    print('MEASURED STRENGTH LADDER   (%d games)' % len(games_list))
    print('=' * 72)
    print('  cfg  depth  nodes     temp  blunder      Elo   95%% CI          step')
    prev = None
    for key in order:
        entry = BY_KEY[key]
        rating = elo[key] - base
        lo, hi = cis.get(key, (float('nan'), float('nan')))
        step = '' if prev is None else '  +%.0f' % (rating - prev)
        print('  %-4s %5d %6d %8.0f %8.2f %8.0f   [%5.0f, %5.0f]%s'
              % (key, entry[1], entry[2], entry[3], entry[4], rating,
                 lo - base, hi - base, step))
        prev = rating

    print('\n  White score across all games: %.1f%%  (colour-balanced, so 50%% expected)'
          % (100 * white_total / len(games_list)))
    print('  Average game length: %.1f plies' % (move_total / len(games_list)))
    print('  Terminations: ' + ', '.join('%s=%d' % kv for kv in sorted(terminations.items())))

    white_share = white_total / len(games_list)
    ladder = select_ladder(elo, cis, order)

    # --- Gates ---
    # Gates apply to the *selected* ladder, not to every candidate. Candidates
    # exist to be measured; some are expected to be redundant. What matters is
    # that the tiers actually shipped are distinguishable.
    print('\n' + '-' * 72)
    print('SELECTED LADDER  (candidates that are not separable are dropped)')
    prev = None
    for key in ladder:
        entry = BY_KEY[key]
        rating = elo[key] - base
        step = '' if prev is None else '  +%.0f' % (rating - prev)
        print('  %-4s depth %2d  nodes %6d  temp %3.0f  blunder %.2f   Elo %5.0f%s'
              % (key, entry[1], entry[2], entry[3], entry[4], rating, step))
        prev = rating
    dropped = [k for k in order if k not in ladder]
    if dropped:
        print('  dropped: %s  (within 100 Elo of a neighbour — more depth here'
              % ', '.join(dropped))
        print('           buys almost nothing; the engine saturates near depth 10,')
        print('           so further strength needs a better evaluation, not more search)')

    print('\nGATES')
    ratings = [elo[k] - base for k in ladder]
    steps = [b - a for a, b in zip(ratings, ratings[1:])]
    min_step = min(steps) if steps else 0
    monotone = all(b > a for a, b in zip(ratings, ratings[1:]))
    disjoint = all(cis[ladder[i]][1] < cis[ladder[i + 1]][0]
                   for i in range(len(ladder) - 1))

    checks = [
        ('ladder is monotone', monotone),
        ('every step >= 100 Elo (min %.0f)' % min_step, min_step >= 100),
        ('adjacent 95%% CIs disjoint', disjoint),
        ('at least 5 usable tiers (%d)' % len(ladder), len(ladder) >= 5),
        ('White share in [0.40, 0.60] (%.3f)' % white_share, 0.40 <= white_share <= 0.60),
    ]
    for label, ok in checks:
        print('  [%s] %s' % ('PASS' if ok else 'FAIL', label))

    passed = all(ok for _, ok in checks)
    print('\n  %s' % ('ALL GATES PASSED — safe to launch the corpus run'
                      if passed else 'GATES FAILED — do not launch the corpus run'))

    with open(LADDER_PATH, 'w') as handle:
        json.dump({
            'elo': {k: elo[k] - base for k in order},
            'ci': {k: [cis[k][0] - base, cis[k][1] - base] for k in cis},
            'ladder': ladder,
            'configs': {e[0]: {'depth': e[1], 'max_nodes': e[2],
                               'temperature': e[3], 'blunder_rate': e[4]}
                        for e in CONFIGS},
            'games': len(games_list),
            'white_share': white_share,
            'gates_passed': passed,
        }, handle, indent=2)
    print('  wrote %s' % os.path.relpath(LADDER_PATH))
    return passed


def select_ladder(elo, cis, order, min_step=100.0):
    """Greedily keep the weakest config, then each next one that is clearly
    stronger than the last — at least `min_step` Elo away with a disjoint
    confidence interval.

    Measuring eight candidates and shipping only the separable ones is the
    point of calibrating: the top of the range saturates, and a tier that
    cannot be told apart from the one below it is a label, not a difficulty.
    """
    ladder = [order[0]]
    for key in order[1:]:
        last = ladder[-1]
        far_enough = (elo[key] - elo[last]) >= min_step
        separated = key in cis and last in cis and cis[last][1] < cis[key][0]
        if far_enough and separated:
            ladder.append(key)
    # Always keep the strongest candidate as the top tier, replacing the
    # previous top if it is not separable from it.
    strongest = order[-1]
    if ladder[-1] != strongest:
        if (elo[strongest] - elo[ladder[-2]] >= min_step
                and cis[ladder[-2]][1] < cis[strongest][0]):
            ladder[-1] = strongest
        else:
            ladder.append(strongest)
    return ladder


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--games', type=int, default=24,
                        help='games per pairing (half with each colour)')
    parser.add_argument('--report', action='store_true',
                        help='refit and report from saved results only')
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)

    if args.report:
        with open(RESULTS_PATH) as handle:
            games_list = [tuple(g) for g in json.load(handle)]
        report(games_list)
        return

    n_openings = max(2, args.games // 2)
    openings(n_openings)

    done = []
    if os.path.exists(RESULTS_PATH):
        with open(RESULTS_PATH) as handle:
            done = [tuple(g) for g in json.load(handle)]
        print('resuming with %d games already played' % len(done))

    played = {}
    for a, b, *_rest in done:
        played[(a, b)] = played.get((a, b), 0) + 1

    tasks = []
    keys = [entry[0] for entry in CONFIGS]
    for i, a_key in enumerate(keys):
        for b_key in keys[i + 1:]:
            have = played.get((a_key, b_key), 0)
            for index in range(have, args.games):
                tasks.append((a_key, b_key, index // 2, index % 2 == 0, n_openings))

    print('configs: %d   pairings: %d   games to play: %d   workers: %d'
          % (len(CONFIGS), len(keys) * (len(keys) - 1) // 2, len(tasks), WORKERS))
    if not tasks:
        report(done)
        return

    t0 = time.perf_counter()
    results = list(done)
    with ProcessPoolExecutor(max_workers=WORKERS) as executor:
        for n, result in enumerate(executor.map(play_pairing, tasks, chunksize=1), 1):
            results.append(result)
            if n % 25 == 0 or n == len(tasks):
                elapsed = time.perf_counter() - t0
                rate = n / elapsed
                eta = (len(tasks) - n) / rate if rate else 0
                print('  %d/%d games  %.2f games/s  ETA %dm%02ds'
                      % (n, len(tasks), rate, int(eta) // 60, int(eta) % 60), flush=True)
                with open(RESULTS_PATH, 'w') as handle:
                    json.dump(results, handle)

    with open(RESULTS_PATH, 'w') as handle:
        json.dump(results, handle)
    report(results)


if __name__ == '__main__':
    main()
