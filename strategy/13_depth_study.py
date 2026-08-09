#!/usr/bin/env python3
"""13_depth_study.py — how deep does the oracle actually need to be?

The advanced chapters rest on three kinds of claim, and only one of them is
exposed to search depth at all:

1. **Rule theorems.** "A piece with no empty neighbour cannot be struck." "No
   move creates new contact without striking." These are properties of the move
   generator, established by enumerating legal moves. No search is involved, so
   no depth can change them.

2. **Frequency statistics.** The door table, the strike-size distribution, stuck
   cobs and mobility against results. These are one-ply computations over
   positions plus the recorded outcome. Search depth does not enter — but the
   *positions* came from games played at roughly 1,100 Elo, so the question is
   whether stronger play would visit a different distribution of positions.

3. **Move-quality claims.** "27.5% of the sharpest positions have a quiet best
   move", and the depth-to-find table. These are the only ones that depend on
   the oracle being right, and the oracle that produced `labels.sqlite` was the
   pre-quiescence engine.

This script measures 2 and 3.

    --stage converge   Does the chosen move stop changing with depth? Runs a
                       quiescence engine at 8/10/12/14/16 on sharp positions and
                       reports agreement with the deepest verdict. If depth 12
                       already agrees with depth 16, deeper labelling buys
                       nothing and the answer to "do we need 18 ply" is no.

    --stage relabel    Re-scores the same positions with the better engine and
                       asks whether the guide's headline number survives: does
                       the best move change, and does its quiet/strike class
                       change?

    --stage drift      Plays fresh games with the better engine and compares the
                       door and cramp distributions against the old corpus. If
                       they match, the frequency tables transfer to stronger
                       play; if they do not, the tables describe 1,100-Elo games
                       and should say so.

    ./venv/bin/python 13_depth_study.py --stage all
"""

import argparse
import json
import os
import random
import sqlite3
import sys
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb
from engine import search2
from engine.openings import frontier_sample
from engine.search2 import strike_count, threatened

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
LABELS = os.path.join(DATA_DIR, 'labels.sqlite')
OUT = os.path.join(DATA_DIR, 'depth_study.json')

MATE = 1_000_000 - 256
DEPTHS = [8, 10, 12, 14, 16]
NODE_CAP = 6_000_000
ORACLE = 'mined+q'
WORKERS = max(2, (os.cpu_count() or 4) - 2)

#: Every search here must use a **full-window root**, which `search_root`
#: selects when `temperature` is non-zero. This is not about move choice, it is
#: about the sibling scores: with a null-window (PVS) root, every root score
#: after the first is a *bound* rather than a value, so `best - runner_up` is
#: meaningless. Reading a gap off a PVS root once produced the conclusion that
#: 94% of the guide's sharp positions were not sharp; re-measured with a full
#: window the figure is 24%. `ai.py` documents the same trap for the same
#: reason. If a stage below reads a gap, it passes this.
EXACT_ROOT = 1.0


def sharp_positions(n=160, gap=100, stride=11, seed=5):
    """Positions the guide would call sharp, as the old oracle labelled them."""
    conn = sqlite3.connect(f'file:{LABELS}?mode=ro', uri=True)
    out = []
    for occ, white, rok, stm, best, sj in conn.execute(
            f'SELECT occ, white, rok, stm, best_move, scores_json FROM positions '
            f'WHERE n_moves > 4 AND rowid % {stride} = 0'):
        scores = json.loads(sj)
        if len(scores) < 2:
            continue
        if abs(scores[0][1]) > MATE or abs(scores[1][1]) > MATE:
            continue
        if scores[0][1] - scores[1][1] <= gap:
            continue
        out.append({'pos': [occ, white, rok, stm], 'old_best': best,
                    'old_gap': scores[0][1] - scores[1][1]})
        if len(out) >= n:
            break
    random.Random(seed).shuffle(out)
    return out


# ─── Convergence ─────────────────────────────────────────────────────────

def _converge_one(case):
    occ, white, rok, stm = case['pos']
    engine = search2.make(ORACLE)
    row = {}
    for d in DEPTHS:
        move, scored, _ = engine.search_root(occ, white, rok, stm, depth=d,
                                             max_nodes=NODE_CAP,
                                             temperature=EXACT_ROOT)
        gap = (scored[0][1] - scored[1][1]) if len(scored) > 1 else 0
        row[d] = {'move': move, 'gap': gap, 'nodes': engine.nodes,
                  'score': scored[0][1] if scored else 0}
    return {'case': case, 'by_depth': row}


def stage_converge(cases):
    with ProcessPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(_converge_one, cases, chunksize=1))

    deepest = DEPTHS[-1]
    table = []
    for d in DEPTHS:
        agree = sum(r['by_depth'][d]['move'] == r['by_depth'][deepest]['move']
                    for r in results)
        nodes = sum(r['by_depth'][d]['nodes'] for r in results) / len(results)
        table.append({'depth': d, 'agrees_with_deepest': agree / len(results),
                      'n': len(results), 'mean_nodes': nodes})

    # How often does the *class* of the move (strike vs quiet) change with depth?
    class_flip = []
    for d in DEPTHS[:-1]:
        flips = 0
        for r in results:
            occ, white, rok, stm = r['case']['pos']
            a = bool(strike_count(occ, white, rok, stm, r['by_depth'][d]['move']))
            b = bool(strike_count(occ, white, rok, stm,
                                  r['by_depth'][deepest]['move']))
            flips += a != b
        class_flip.append({'depth': d, 'class_changes_by_16': flips / len(results)})

    print(f"\nAgreement with the depth-{deepest} choice, {len(results)} sharp "
          f"positions, oracle = {ORACLE}:")
    for row in table:
        print(f"  depth {row['depth']:>2}  {row['agrees_with_deepest']:6.1%}  "
              f"({row['mean_nodes']:>11,.0f} nodes/position)")
    print("\nHow often the strike/quiet class of the best move differs from "
          "depth 16:")
    for row in class_flip:
        print(f"  depth {row['depth']:>2}  {row['class_changes_by_16']:6.1%}")
    return {'agreement': table, 'class_flip': class_flip}


# ─── Re-label ────────────────────────────────────────────────────────────

def _relabel_one(case):
    occ, white, rok, stm = case['pos']
    engine = search2.make(ORACLE)
    move, scored, _ = engine.search_root(occ, white, rok, stm, depth=12,
                                         max_nodes=NODE_CAP,
                                         temperature=EXACT_ROOT)
    gap = (scored[0][1] - scored[1][1]) if len(scored) > 1 else 0
    decisive = bool(scored) and abs(scored[0][1]) > MATE
    return {
        'same_move': move == case['old_best'],
        'old_quiet': not strike_count(occ, white, rok, stm, case['old_best']),
        'new_quiet': not strike_count(occ, white, rok, stm, move),
        'still_sharp': gap > 100 and not decisive,
        'decisive': decisive,
    }


def stage_relabel(cases):
    with ProcessPoolExecutor(max_workers=WORKERS) as pool:
        rows = list(pool.map(_relabel_one, cases, chunksize=1))
    n = len(rows)
    same = sum(r['same_move'] for r in rows)
    old_q = sum(r['old_quiet'] for r in rows)
    new_q = sum(r['new_quiet'] for r in rows)
    class_same = sum(r['old_quiet'] == r['new_quiet'] for r in rows)
    still = sum(r['still_sharp'] for r in rows)

    print(f"\nRe-labelled {n} sharp positions with {ORACLE} at depth 12:")
    print(f"  best move unchanged:            {same / n:6.1%}")
    print(f"  strike/quiet class unchanged:   {class_same / n:6.1%}")
    print(f"  quiet share, old oracle:        {old_q / n:6.1%}")
    print(f"  quiet share, new oracle:        {new_q / n:6.1%}")
    print(f"  still sharp (>1 piece, no mate):{still / n:6.1%}")
    return {'n': n, 'same_move': same / n, 'class_unchanged': class_same / n,
            'quiet_old': old_q / n, 'quiet_new': new_q / n,
            'still_sharp': still / n}


# ─── Distribution drift ──────────────────────────────────────────────────

def _play_one(task):
    index, start, budget = task
    engine = search2.make(ORACLE)
    rng = random.Random(index * 7919)
    occ, white, rok, stm = start
    doors = Counter()
    stuck = Counter()
    for _ in range(160):
        if bb.terminal_loser(occ, white, rok, stm) is not None:
            break
        empty = bb.FULL & ~occ
        for i in bb.bit_list(occ):
            doors[(bb.ADJ[i] & empty).bit_count()] += 1
        for colour in (bb.WHITE, bb.BLACK):
            own = white if colour == bb.WHITE else occ & ~white
            fwd = bb.FWD[colour]
            stuck[sum(not (fwd[i] & empty) for i in
                      bb.bit_list(own & ~rok & ~bb.HOME[colour]))] += 1
        move, _s, _d = engine.search_root(occ, white, rok, stm, depth=24,
                                          max_nodes=budget, rng=rng)
        if move is None:
            break
        occ, white, rok, stm = bb.make_move(occ, white, rok, stm, move)
    return doors, stuck


def stage_drift(games=48, budget=60_000):
    """Do stronger games visit the same positions the door table describes?"""
    starts = [bb.from_state(s) for s in
              frontier_sample(4, games, random.Random(11), mirror_balanced=True)]
    tasks = [(i, s, budget) for i, s in enumerate(starts)]
    doors, stuck = Counter(), Counter()
    with ProcessPoolExecutor(max_workers=WORKERS) as pool:
        for d, s in pool.map(_play_one, tasks, chunksize=1):
            doors.update(d)
            stuck.update(s)

    conn = sqlite3.connect(f'file:{LABELS}?mode=ro', uri=True)
    old_doors, old_stuck = Counter(), Counter()
    for occ, white, rok, stm in conn.execute(
            'SELECT occ, white, rok, stm FROM positions WHERE rowid % 16 = 0'):
        empty = bb.FULL & ~occ
        for i in bb.bit_list(occ):
            old_doors[(bb.ADJ[i] & empty).bit_count()] += 1
        for colour in (bb.WHITE, bb.BLACK):
            own = white if colour == bb.WHITE else occ & ~white
            fwd = bb.FWD[colour]
            old_stuck[sum(not (fwd[i] & empty) for i in
                          bb.bit_list(own & ~rok & ~bb.HOME[colour]))] += 1

    def share(counter):
        total = sum(counter.values()) or 1
        return {k: v / total for k, v in sorted(counter.items())}

    new_d, old_d = share(doors), share(old_doors)
    new_s, old_s = share(stuck), share(old_stuck)
    print(f"\nDoor distribution, corpus (1,100 Elo) vs {ORACLE} self-play:")
    print(f"  {'doors':>6}{'corpus':>10}{'stronger':>10}{'shift':>9}")
    for k in sorted(set(new_d) | set(old_d)):
        a, b = old_d.get(k, 0), new_d.get(k, 0)
        print(f"  {k:>6}{a:>10.1%}{b:>10.1%}{b - a:>+9.1%}")
    print("\nStuck-cob distribution (per side, per position):")
    print(f"  {'stuck':>6}{'corpus':>10}{'stronger':>10}{'shift':>9}")
    for k in sorted(set(new_s) | set(old_s)):
        a, b = old_s.get(k, 0), new_s.get(k, 0)
        print(f"  {k:>6}{a:>10.1%}{b:>10.1%}{b - a:>+9.1%}")
    return {'doors_corpus': old_d, 'doors_strong': new_d,
            'stuck_corpus': old_s, 'stuck_strong': new_s}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', default='all',
                    choices=['all', 'converge', 'relabel', 'drift'])
    ap.add_argument('--positions', type=int, default=160)
    args = ap.parse_args()

    results = {}
    if os.path.exists(OUT):
        with open(OUT) as fh:
            results = json.load(fh)

    if args.stage in ('all', 'converge', 'relabel'):
        cases = sharp_positions(args.positions)
        print(f"{len(cases)} sharp positions drawn from labels.sqlite")
        if args.stage in ('all', 'converge'):
            results['converge'] = stage_converge(cases)
        if args.stage in ('all', 'relabel'):
            results['relabel'] = stage_relabel(cases)

    if args.stage in ('all', 'drift'):
        results['drift'] = stage_drift()

    with open(OUT, 'w') as fh:
        json.dump(results, fh, indent=2)
    print(f"\nwritten to {OUT}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
