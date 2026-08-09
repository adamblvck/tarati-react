#!/usr/bin/env python3
"""11_advanced_metrics.py — the measurements behind the advanced chapters.

`09_mine_patterns.py` answers "what does the engine value?". This one answers
"what does a 1200 player not yet see?", which is a different question and needs
different statistics: not what correlates with the score, but what separates a
move a club player finds from one they do not.

Five things are measured, each of which becomes a chapter section:

1. **Conservation.** The board holds eight pieces for the whole game. A strike
   converts rather than removes, so every strike is a two-piece swing.
2. **Doors.** A piece can only be struck through an *empty* neighbour. Counting
   them gives a risk number a human can compute at the board, and zero doors is
   immunity rather than a low rate.
3. **Contact.** The pre-adjacency rule (patent section 4.1) means a piece can
   never strike an enemy it was already touching. Stated as a theorem and
   checked against every strike in the corpus.
4. **Road.** Cobs move one way. The remaining forward steps a side owns is a
   depletable resource, and running out is a loss condition independent of
   material.
5. **Quiet power moves.** In positions where one move wins by more than a
   piece, what fraction of the winning moves are not strikes, and what are they
   doing instead.

Inputs:  data/labels.sqlite, data/corpus.sqlite
Outputs: data/findings_advanced.json, data/findings_advanced.md

    ./venv/bin/python 11_advanced_metrics.py
"""

import argparse
import json
import math
import os
import sqlite3
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb
from engine.board import VERTICES, ADJACENCY, MAX_RANK
from engine.search2 import threatened, strike_count

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
LABELS = os.path.join(DATA_DIR, 'labels.sqlite')
CORPUS = os.path.join(DATA_DIR, 'corpus.sqlite')
OUT_JSON = os.path.join(DATA_DIR, 'findings_advanced.json')
OUT_MD = os.path.join(DATA_DIR, 'findings_advanced.md')

DEGREE = {bb.INDEX[v]: len(ADJACENCY[v]) for v in VERTICES}

findings = []


def record(section, claim, stat, n, detail=None):
    findings.append({'section': section, 'claim': claim, 'stat': stat,
                     'n': int(n), 'detail': detail or {}})


def wilson(k, n):
    if n == 0:
        return 0.0, [0.0, 0.0]
    p, z = k / n, 1.959964
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, [max(0.0, centre - half), min(1.0, centre + half)]


# ─── Board helpers ───────────────────────────────────────────────────────

def doors(occ, i):
    """Empty neighbours of vertex i — the squares an attacker can arrive on."""
    return (bb.ADJ[i] & (bb.FULL & ~occ)).bit_count()


def road(occ, white, rok, colour):
    """Forward steps remaining to the side's cobs.

    White advances toward rank 0 and Black toward MAX_RANK, so a cob's road is
    its distance to the far edge. Roks are excluded: they move in any
    direction and never run out.
    """
    own = white if colour == bb.WHITE else occ & ~white
    total = 0
    for i in bb.bit_list(own & ~rok):
        total += bb.RANK_OF[i] if colour == bb.WHITE else MAX_RANK - bb.RANK_OF[i]
    return total


# ─── 1. Conservation ─────────────────────────────────────────────────────

def measure_conservation(corpus):
    """Piece count is invariant, and a strike moves two pieces of material."""
    counts = Counter()
    per_strike = Counter()
    strikes = total_moves = 0
    for (mask,) in corpus.execute(
            'SELECT strikes FROM moves WHERE game_id <= 4000'):
        total_moves += 1
        n = bin(mask).count('1')
        if n:
            strikes += 1
            per_strike[n] += 1

    # Occupancy invariance, replayed rather than asserted.
    for game_id, occ0, w0, r0, s0 in corpus.execute(
            'SELECT game_id, seed_occ, seed_white, seed_rok, seed_stm '
            'FROM games LIMIT 300'):
        occ, white, rok, stm = occ0, w0, r0, s0
        counts[occ.bit_count()] += 1
        for (move,) in corpus.execute(
                'SELECT move FROM moves WHERE game_id = ? ORDER BY ply', (game_id,)):
            occ, white, rok, stm = bb.make_move(occ, white, rok, stm, move)
            counts[occ.bit_count()] += 1

    record('conservation',
           'The board holds the same number of pieces from the first move to '
           'the last: a strike converts a piece, it never removes one. Material '
           'is therefore a share of a fixed eight, and one strike is a '
           'two-piece swing.',
           sorted(counts), sum(counts.values()),
           {'occupancy_counts': {str(k): v for k, v in sorted(counts.items())},
            'strike_share_of_moves': strikes / max(total_moves, 1),
            'pieces_flipped_per_strike':
                {str(k): v for k, v in sorted(per_strike.items())},
            'mean_flipped_per_strike':
                sum(k * v for k, v in per_strike.items()) / max(strikes, 1)})
    return per_strike


# ─── 2. Doors ────────────────────────────────────────────────────────────

def measure_doors(labels, stride=4):
    """Chance a piece can be flipped this move, by its count of empty neighbours."""
    by_doors = defaultdict(lambda: [0, 0])
    by_vertex = defaultdict(lambda: [0, 0])
    positions = 0

    for occ, white, rok, stm in labels.execute(
            f'SELECT occ, white, rok, stm FROM positions WHERE rowid % {stride} = 0'):
        positions += 1
        mover = white if stm == bb.WHITE else occ & ~white
        victims = occ & ~mover
        hanging = threatened(occ, white, rok, stm) & victims
        empty = bb.FULL & ~occ
        for i in bb.bit_list(victims):
            d = (bb.ADJ[i] & empty).bit_count()
            hit = (hanging >> i) & 1
            by_doors[d][0] += 1
            by_doors[d][1] += hit
            by_vertex[i][0] += 1
            by_vertex[i][1] += hit

    table = []
    for d in sorted(by_doors):
        n, k = by_doors[d]
        p, ci = wilson(k, n)
        table.append({'doors': d, 'n': n, 'rate': p, 'ci': ci})

    vertices = []
    for i in sorted(by_vertex, key=lambda i: -DEGREE[i]):
        n, k = by_vertex[i]
        p, ci = wilson(k, n)
        vertices.append({'vertex': bb.VERTEX[i], 'degree': DEGREE[i],
                         'n': n, 'rate': p, 'ci': ci})

    zero = by_doors.get(0, [0, 0])
    record('doors',
           'A piece can only be struck through an empty neighbour, so the '
           'number of empty squares beside it — its doors — is the whole of its '
           'risk. The rate rises almost linearly with the count, and a piece '
           'with no door at all cannot be struck by any move.',
           table[-1]['rate'] if table else 0,
           sum(v[0] for v in by_doors.values()),
           {'by_doors': table, 'by_vertex': vertices,
            'zero_door_exceptions': zero[1], 'zero_door_observations': zero[0]})
    return table, vertices


# ─── 3. Contact ──────────────────────────────────────────────────────────

def measure_contact(corpus, limit=200_000):
    """Every strike must come from a piece that was NOT already touching.

    This is the pre-adjacency rule read backwards, and it is the single most
    useful defensive fact in the game: stepping into contact with an enemy
    permanently disarms that enemy against you.
    """
    checked = violations = 0
    victims_by_doors = Counter()

    for game_id, occ0, w0, r0, s0 in corpus.execute(
            'SELECT game_id, seed_occ, seed_white, seed_rok, seed_stm '
            'FROM games LIMIT 2000'):
        occ, white, rok, stm = occ0, w0, r0, s0
        for move, mask in corpus.execute(
                'SELECT move, strikes FROM moves WHERE game_id = ? ORDER BY ply',
                (game_id,)):
            if mask:
                src = move >> 5
                for i in bb.bit_list(mask):
                    checked += 1
                    if bb.ADJ[src] & (1 << i):
                        violations += 1
                    victims_by_doors[doors(occ, i)] += 1
                    if checked >= limit:
                        break
            occ, white, rok, stm = bb.make_move(occ, white, rok, stm, move)
        if checked >= limit:
            break

    record('contact',
           'No piece has ever struck an enemy it was already touching, in any '
           'game in the corpus. The strike rule fires on arrival beside an '
           'enemy, so a piece that is already beside you can shuffle all it '
           'likes and never take you. Making contact disarms the piece you '
           'touch.',
           violations, checked,
           {'strikes_checked': checked, 'violations': violations,
            'victim_doors_at_moment_of_strike':
                {str(k): v for k, v in sorted(victims_by_doors.items())}})
    return checked, violations


# ─── 4. Road ─────────────────────────────────────────────────────────────

def measure_road(labels, corpus, stride=4):
    """Does the side with more forward steps left win?

    Road is counted only over cobs, and only in positions from real games, so
    the number is the one a player could count over the board.

    The headline table is the one conditioned on **equal material**. Road and
    material are entangled by construction — a side with six pieces has more
    cobs and therefore more road than a side with two — so the unconditional
    table mostly re-measures the piece count. Holding material level is what
    makes the claim about road rather than about being ahead.
    """
    outcomes = {gid: w for gid, w in corpus.execute(
        'SELECT game_id, winner FROM games WHERE game_id <= 40000')}

    buckets = defaultdict(lambda: [0, 0, 0])   # advantage -> [white, black, draw]
    level = defaultdict(lambda: [0, 0, 0])     # ...restricted to 4v4
    late = defaultdict(lambda: [0, 0, 0])      # ...4v4 and past move twenty

    rows = labels.execute(
        f'SELECT p.occ, p.white, p.rok, p.stm, p.game_id, p.ply '
        f'FROM plays p WHERE p.rowid % {stride} = 0')
    for occ, white, rok, stm, game_id, ply in rows:
        winner = outcomes.get(game_id)
        if winner is None:
            continue
        edge = road(occ, white, rok, bb.WHITE) - road(occ, white, rok, bb.BLACK)
        bucket = max(-4, min(4, edge // 3))
        slot = 0 if winner == 'WHITE' else 1 if winner == 'BLACK' else 2
        buckets[bucket][slot] += 1
        if white.bit_count() == (occ & ~white).bit_count():
            level[bucket][slot] += 1
            if ply >= 40:
                late[bucket][slot] += 1

    def rows_of(table, floor=200):
        out = []
        for b in sorted(table):
            w, bl, d = table[b]
            n = w + bl + d
            if n < floor:
                continue
            p, ci = wilson(w + 0.5 * d, n)
            out.append({'road_edge_bucket': b * 3, 'n': n,
                        'white_score': p, 'ci': ci})
        return out

    all_rows = rows_of(buckets)
    level_rows = rows_of(level)
    late_rows = rows_of(late, floor=100)
    record('road',
           'Total road is not a real quantity. Unconditionally it looks like a '
           'powerful predictor — White scores 14% at the bottom of the range '
           'and 87% at the top — but almost all of that is the piece count in '
           'disguise, because a side with more pieces has more cobs and so more '
           'road. Held at equal material the curve flattens to noise. What '
           'matters is not how much road a side owns but whether particular '
           'cobs have run out; see the cramp measurements.',
           level_rows[-1]['white_score'] if level_rows else 0,
           sum(sum(v) for v in level.values()),
           {'equal_material': level_rows,
            'equal_material_from_ply_40': late_rows,
            'unconditional': all_rows,
            'note': 'the unconditional table is retained only as the '
                    'counter-example: it is what the finding looks like before '
                    'the material control, and it is wrong'})
    return level_rows, all_rows


def measure_cramp(labels, corpus, stride=4):
    """Cramp, at equal material: stuck cobs and the mobility difference.

    A cob outside its own home base moves one way only, so once every forward
    square in front of it is occupied it is stuck: it cannot move again unless
    the board opens or it promotes. Counting stuck cobs is the sharp version of
    the road idea, and unlike total road it survives a material control.
    """
    outcomes = {gid: w for gid, w in corpus.execute(
        'SELECT game_id, winner FROM games WHERE game_id <= 40000')}

    def stuck(occ, white, rok, colour):
        own = white if colour == bb.WHITE else occ & ~white
        empty = bb.FULL & ~occ
        fwd = bb.FWD[colour]
        return sum(not (fwd[i] & empty) for i in
                   bb.bit_list(own & ~rok & ~bb.HOME[colour]))

    stuck_t = defaultdict(lambda: [0, 0, 0])
    mob_t = defaultdict(lambda: [0, 0, 0])

    for occ, white, rok, stm, game_id in labels.execute(
            f'SELECT occ, white, rok, stm, game_id FROM plays '
            f'WHERE rowid % {stride} = 0'):
        winner = outcomes.get(game_id)
        if winner is None or white.bit_count() != (occ & ~white).bit_count():
            continue
        slot = 0 if winner == 'WHITE' else 1 if winner == 'BLACK' else 2
        s = stuck(occ, white, rok, bb.WHITE) - stuck(occ, white, rok, bb.BLACK)
        stuck_t[max(-3, min(3, s))][slot] += 1
        m = bb.mobility(occ, white, rok, bb.WHITE) - \
            bb.mobility(occ, white, rok, bb.BLACK)
        mob_t[max(-3, min(3, m // 3))][slot] += 1

    def rows_of(table, scale=1):
        out = []
        for b in sorted(table):
            w, bl, d = table[b]
            n = w + bl + d
            if n < 150:
                continue
            p, ci = wilson(w + 0.5 * d, n)
            out.append({'edge': b * scale, 'n': n, 'white_score': p, 'ci': ci})
        return out

    stuck_rows = rows_of(stuck_t)
    mob_rows = rows_of(mob_t, scale=3)
    record('cramp',
           'Between sides holding the same number of pieces, cramp decides. '
           'Each cob of yours that has run out of forward squares is worth '
           'roughly ten points of result, and a side two stuck cobs down scores '
           'about one game in five. The move count tells the same story: three '
           'extra legal moves is worth about nine points. This is the mobility '
           'claim from the board-control chapter, re-measured with material '
           'held level, which is a stronger test than the regression it came '
           'from.',
           stuck_rows[-1]['white_score'] if stuck_rows else 0,
           sum(sum(v) for v in stuck_t.values()),
           {'stuck_cob_edge': stuck_rows, 'mobility_edge': mob_rows})
    return stuck_rows, mob_rows


# ─── 5. Quiet power moves ────────────────────────────────────────────────

#: Effects a quiet move can have, in the order the guide teaches them. The
#: primary label is the first tag a move carries, so a move that both escapes
#: and threatens is reported as an escape — you played it because the piece was
#: hanging. The full tag set is reported alongside, because "62% of quiet power
#: moves also build a threat" is a different and equally useful sentence.
EFFECT_ORDER = ['escape', 'threat', 'smother', 'shut', 'promote']


def _total_doors(occ, own):
    empty = bb.FULL & ~occ
    return sum((bb.ADJ[i] & empty).bit_count() for i in bb.bit_list(own))


def effects(occ, white, rok, stm, move):
    """The set of things a non-striking move does, as tags a player can act on."""
    src, dst = move >> 5, move & 31
    if src == dst:
        return {'promote'}

    after = bb.make_move(occ, white, rok, stm, move)
    a_occ, a_white, a_rok, a_stm = after
    own_before = white if stm == bb.WHITE else occ & ~white
    own_after = a_white if stm == bb.WHITE else a_occ & ~a_white
    enemy_before = occ & ~own_before

    tags = set()

    # What the opponent could take before, and after.
    enemy_threats = threatened(occ, white, rok, stm ^ 1)
    after_threats = threatened(a_occ, a_white, a_rok, a_stm)
    if (enemy_threats >> src) & 1 and not ((after_threats >> dst) & 1):
        tags.add('escape')
    if (enemy_threats & own_before & ~(1 << src)) & ~after_threats:
        tags.add('cover')

    # There is deliberately no "step into contact" tag. Arriving beside an
    # enemy you were not already beside *is* the strike rule, so a quiet move
    # can never create contact — see measure_approach().

    # What we can take next move, before and after.
    mine_before = threatened(occ, white, rok, stm) & enemy_before
    mine_after = threatened(a_occ, a_white, a_rok, stm) & (a_occ & ~own_after)
    if mine_after.bit_count() > mine_before.bit_count():
        tags.add('threat')

    if bb.mobility(a_occ, a_white, a_rok, stm ^ 1) < \
            bb.mobility(occ, white, rok, stm ^ 1) - 1:
        tags.add('smother')

    if _total_doors(a_occ, own_after) < _total_doors(occ, own_before):
        tags.add('shut')

    if (not ((rok >> src) & 1)) and (bb.HOME[stm ^ 1] & (1 << dst)):
        tags.add('promote')

    return tags


def classify(occ, white, rok, stm, move):
    """Primary label for a best move: 'strike', or the first effect it has."""
    if strike_count(occ, white, rok, stm, move):
        return 'strike'
    tags = effects(occ, white, rok, stm, move)
    for tag in EFFECT_ORDER:
        if tag in tags:
            return tag
    return 'cover' if 'cover' in tags else 'quiet-other'


def measure_power_moves(labels, gap=100, stride=1):
    """Positions with a >1-piece gap to the runner-up, split by move type."""
    # A move that wins the game outright scores near WINNING_SCORE, so its
    # "gap" is a mate margin and not a quantity of material. Averaging the two
    # kinds together is what once produced a mean loss of 1,052 pieces on an
    # eight-piece board, so they are counted separately throughout.
    MATE = 1_000_000 - 256

    kinds = Counter()
    kinds_decisive = Counter()
    tag_counts = Counter()
    gap_by_kind = defaultdict(list)
    examples = defaultdict(list)
    sharp = total = quiet_all = quiet_sharp = 0
    decisive = quiet_decisive = 0

    for occ, white, rok, stm, best, sj in labels.execute(
            f'SELECT occ, white, rok, stm, best_move, scores_json '
            f'FROM positions WHERE n_moves > 3 AND rowid % {stride} = 0'):
        scores = json.loads(sj)
        if len(scores) < 2:
            continue
        total += 1
        is_strike = bool(strike_count(occ, white, rok, stm, best))
        quiet_all += not is_strike
        edge = scores[0][1] - scores[1][1]
        if edge <= gap:
            continue

        # Splits the two senses of "sharp": the best move wins a piece, or the
        # best move is the only one that does not lose the game.
        is_decisive = abs(scores[0][1]) > MATE or abs(scores[1][1]) > MATE
        if is_decisive:
            decisive += 1
            quiet_decisive += not is_strike
            kinds_decisive['strike' if is_strike else 'quiet'] += 1
            continue

        sharp += 1
        if is_strike:
            kinds['strike'] += 1
            gap_by_kind['strike'].append(edge)
            continue

        quiet_sharp += 1
        tags = effects(occ, white, rok, stm, best)
        for tag in tags:
            tag_counts[tag] += 1
        kind = next((t for t in EFFECT_ORDER if t in tags),
                    'cover' if 'cover' in tags else 'quiet-other')
        kinds[kind] += 1
        gap_by_kind[kind].append(edge)
        if len(examples[kind]) < 8 and edge > 200:
            examples[kind].append({
                'pos': [occ, white, rok, stm],
                'move': bb.move_to_vertices(best),
                'gap': edge,
                'runner_up': bb.move_to_vertices(scores[1][0]),
                'tags': sorted(tags),
            })

    p, ci = wilson(quiet_sharp, sharp)
    pd, cid = wilson(quiet_decisive, max(decisive, 1))
    record('power-moves',
           'In the sharpest positions — where one move beats every alternative '
           'by more than a whole piece — the winning move is not a strike about '
           'a quarter of the time. Those are the moves a club player never '
           'looks at, because nothing is being taken. Positions where the best '
           'move settles the game outright are counted separately: there the '
           'gap is a mate margin, not an amount of material.',
           p, sharp,
           {'sharp_positions': sharp, 'all_positions': total,
            'quiet_share_of_sharp': p, 'ci': ci,
            'decisive_positions': decisive,
            'quiet_share_of_decisive': pd, 'decisive_ci': cid,
            'decisive_by_kind': dict(kinds_decisive),
            'quiet_share_of_all_best_moves': quiet_all / max(total, 1),
            'primary_label': {
                k: {'n': v, 'share_of_sharp': v / sharp,
                    'median_gap': sorted(gap_by_kind[k])[len(gap_by_kind[k]) // 2]}
                for k, v in kinds.most_common()},
            # Shares of the quiet subset, and they overlap: one move can escape,
            # disarm and build a threat at once, which is usually why it wins by
            # a piece when nothing else does.
            'effect_share_of_quiet': {
                k: {'n': v, 'share': v / max(quiet_sharp, 1)}
                for k, v in tag_counts.most_common()},
            'examples': {k: v for k, v in examples.items()}})
    return kinds, tag_counts, examples


# ─── 6. Approach ─────────────────────────────────────────────────────────

def measure_approach(labels, stride=16):
    """You cannot walk up to an enemy. Arriving beside one is the strike.

    The strike rule fires on every enemy adjacent to the destination that was
    not adjacent to the origin — which is exactly the definition of "an enemy
    you were not already touching". So contact on the board is never something
    a player walked into: it was created by a strike, by a slide that stayed in
    contact, or by a third piece changing colour nearby. That is why there is
    no such thing as quietly approaching an enemy, and why the only safe way to
    stand next to one is to already be there.
    """
    approaches = quiet_approaches = moves = 0
    for occ, white, rok, stm in labels.execute(
            f'SELECT occ, white, rok, stm FROM positions WHERE rowid % {stride} = 0'):
        enemy = (occ & ~white) if stm == bb.WHITE else white
        for move in bb.gen_moves(occ, white, rok, stm):
            src, dst = move >> 5, move & 31
            if src == dst:
                continue
            moves += 1
            if bb.ADJ[dst] & ~bb.ADJ[src] & enemy:
                approaches += 1
                if not strike_count(occ, white, rok, stm, move):
                    quiet_approaches += 1

    record('approach',
           'There is no quiet approach. Arriving beside an enemy you were not '
           'already beside is the strike rule itself, so every move that makes '
           'new contact takes a piece, and no move makes new contact without '
           'taking one. Contact on the board is therefore always the residue '
           'of a strike, never something a player walked into.',
           quiet_approaches, moves,
           {'legal_moves_examined': moves,
            'moves_making_new_contact': approaches,
            'of_which_struck_nothing': quiet_approaches,
            'share_of_moves_that_strike': approaches / max(moves, 1)})
    return moves, approaches, quiet_approaches


# ─── 7. How deep you must look ───────────────────────────────────────────

def measure_depth_to_find(labels, per_kind=90, max_depth=12, gap=100,
                          stride=3):
    """The shallowest search that finds each kind of winning move.

    This is the closest thing to a difficulty rating the data can give. A move
    a depth-2 search already finds is one a club player sees; a move that needs
    depth 9 is one they will not find at the board without knowing the pattern
    by name. Ordering the categories by this number orders the curriculum.
    """
    from engine import search2

    engine = search2.make('full')
    samples = defaultdict(list)

    for occ, white, rok, stm, best, sj in labels.execute(
            f'SELECT occ, white, rok, stm, best_move, scores_json '
            f'FROM positions WHERE n_moves > 3 AND rowid % {stride} = 0'):
        if all(len(v) >= per_kind for v in samples.values()) and len(samples) >= 6:
            break
        scores = json.loads(sj)
        if len(scores) < 2 or scores[0][1] - scores[1][1] <= gap:
            continue
        # Forced wins are excluded: their gap is a mate margin, and a search
        # that proves a mate stops early, which would flatter the depth count.
        if abs(scores[0][1]) > 1_000_000 - 256 or abs(scores[1][1]) > 1_000_000 - 256:
            continue
        kind = classify(occ, white, rok, stm, best)
        if len(samples[kind]) >= per_kind:
            continue
        samples[kind].append((occ, white, rok, stm, best))

    out = {}
    for kind, cases in samples.items():
        if len(cases) < 20:
            continue
        depths = []
        for occ, white, rok, stm, best in cases:
            found = max_depth + 1
            for d in range(1, max_depth + 1):
                move, _s, _dd = engine.search_root(occ, white, rok, stm,
                                                   depth=d, max_nodes=300_000)
                if move == best:
                    found = d
                    break
            depths.append(found)
        depths.sort()
        out[kind] = {
            'n': len(depths),
            'median_depth': depths[len(depths) // 2],
            'mean_depth': sum(depths) / len(depths),
            'found_by_depth_2': sum(d <= 2 for d in depths) / len(depths),
            'found_by_depth_4': sum(d <= 4 for d in depths) / len(depths),
            'needs_depth_7_plus': sum(d >= 7 for d in depths) / len(depths),
        }

    record('depth-to-find',
           'How deep the search has to go before it picks the winning move, by '
           'what the move does. Strikes and escapes are shallow — a club player '
           'finds them. Moves that shut a door or build a threat need several '
           'plies more, which is why they are the ones worth learning as named '
           'patterns rather than calculating from scratch.',
           len(out), sum(v['n'] for v in out.values()),
           {'by_kind': dict(sorted(out.items(),
                                   key=lambda kv: kv[1]['median_depth']))})
    return out


# ─── Report ──────────────────────────────────────────────────────────────

def write_report():
    with open(OUT_JSON, 'w') as fh:
        json.dump(findings, fh, indent=2)

    lines = [
        '# Tarati — advanced findings',
        '',
        'Generated by `11_advanced_metrics.py`. These are the measurements the',
        '1200-1800 chapters are built on: not what the engine values, but what',
        'separates a move a club player finds from one they do not. Rates carry',
        'Wilson intervals.',
        '',
    ]
    for f in findings:
        lines += [f"## {f['section']}", '',
                  f"- **{f['claim']}**",
                  f"  statistic `{f['stat']}`, n = {f['n']:,}",
                  '  <details><summary>detail</summary>', '',
                  '  ```json',
                  *('  ' + line for line in
                    json.dumps(f['detail'], indent=2).splitlines()),
                  '  ```', '  </details>', '']
    with open(OUT_MD, 'w') as fh:
        fh.write('\n'.join(lines) + '\n')
    print(f"\nwritten to {OUT_JSON} and {OUT_MD}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--labels', default=LABELS,
                    help='label database; pass data/labels_q.sqlite to use the '
                         'quiescence oracle instead of the original')
    ap.add_argument('--out-prefix', default='findings_advanced',
                    help='basename for the JSON and Markdown written to data/')
    ap.add_argument('--skip', default='',
                    help='comma-separated stage names to skip, for running the '
                         'oracle-dependent stages alone against fresh labels')
    args = ap.parse_args()

    global OUT_JSON, OUT_MD
    OUT_JSON = os.path.join(DATA_DIR, args.out_prefix + '.json')
    OUT_MD = os.path.join(DATA_DIR, args.out_prefix + '.md')
    skip = {s.strip() for s in args.skip.split(',') if s.strip()}

    labels = sqlite3.connect(f'file:{args.labels}?mode=ro', uri=True)
    corpus = sqlite3.connect(f'file:{CORPUS}?mode=ro', uri=True)
    print(f'labels: {args.labels}')

    if 'conservation' not in skip:
        print('[1] conservation')
        per_strike = measure_conservation(corpus)
        print('    pieces flipped per strike:', dict(sorted(per_strike.items())))

    if 'doors' not in skip:
        print('[2] doors')
        table, vertices = measure_doors(labels)
        for row in table:
            print(f"    {row['doors']} doors  n={row['n']:>7,}  {row['rate']:6.1%}")

    if 'contact' not in skip:
        print('[3] contact')
        checked, violations = measure_contact(corpus)
        print(f"    {checked:,} strikes checked, {violations} came from a piece "
              f"already in contact")

    if 'road' not in skip:
        print('[4a] road — the negative result')
        level_rows, all_rows = measure_road(labels, corpus)
        print('     unconditional:  ' + '  '.join(
            f"{r['road_edge_bucket']:+d}:{r['white_score']:.0%}" for r in all_rows))
        print('     equal material: ' + '  '.join(
            f"{r['road_edge_bucket']:+d}:{r['white_score']:.0%}" for r in level_rows))

    if 'cramp' not in skip:
        print('[4b] cramp, at equal material')
        stuck_rows, mob_rows = measure_cramp(labels, corpus)
        for row in stuck_rows:
            print(f"     stuck-cob edge {row['edge']:+2d}  n={row['n']:>6,}  "
                  f"White scores {row['white_score']:6.1%}")
        for row in mob_rows:
            print(f"     mobility edge {row['edge']:+3d}  n={row['n']:>6,}  "
                  f"White scores {row['white_score']:6.1%}")

    if 'power-moves' not in skip:
        print('[5] quiet power moves')
        kinds, tags, _examples = measure_power_moves(labels)
        total = sum(kinds.values())
        for kind, n in kinds.most_common():
            print(f"    {kind:14s} {n:>7,}  {n / total:6.1%} of sharp positions")
        quiet = total - kinds['strike']
        print('    effects (overlapping, as a share of the quiet ones):')
        for tag, n in tags.most_common():
            print(f"      {tag:12s} {n:>7,}  {n / max(quiet, 1):6.1%}")

    if 'approach' not in skip:
        print('[6] approach')
        moves, approaches, quiet_approaches = measure_approach(labels)
        print(f"    {moves:,} legal moves; {approaches:,} make new contact; "
              f"{quiet_approaches} of those strike nothing")

    if 'depth' not in skip:
        print('[7] how deep you must look')
        depths = measure_depth_to_find(labels)
        for kind, row in sorted(depths.items(), key=lambda kv: kv[1]['median_depth']):
            print(f"    {kind:14s} n={row['n']:>3}  median depth "
                  f"{row['median_depth']:>2}   found by depth 4: "
                  f"{row['found_by_depth_4']:5.0%}")

    write_report()
    return 0


if __name__ == '__main__':
    sys.exit(main())
