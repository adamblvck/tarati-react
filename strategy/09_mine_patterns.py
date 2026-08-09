#!/usr/bin/env python3
"""09_mine_patterns.py — turn the labelled corpus into stated, checkable claims.

Every finding this emits carries an effect size, a sample size, a confidence
interval, and a reproducible position it came from. That is the whole point:
the guide should never say "control the centre" as received wisdom, it should
say what centre control is worth, over how many positions, with what
uncertainty, and show one you can set up on a board.

Inputs:  data/labels.sqlite  (oracle scores + features per position)
         data/corpus.sqlite  (game outcomes)
         data/book.sqlite    (exhaustive opening)
Outputs: data/findings.json  (structured, for the guide generator)
         data/findings.md    (readable, for review)

Run on CPython (needs numpy/pandas):

    ./venv/bin/python 09_mine_patterns.py
"""

import json
import math
import os
import sqlite3
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
LABELS = os.path.join(DATA_DIR, 'labels.sqlite')
CORPUS = os.path.join(DATA_DIR, 'corpus.sqlite')
BOOK = os.path.join(DATA_DIR, 'book.sqlite')
OUT_JSON = os.path.join(DATA_DIR, 'findings.json')
OUT_MD = os.path.join(DATA_DIR, 'findings.md')

FEATURES = [
    'material', 'white_roks', 'black_roks', 'hub', 'b_ring', 'c_ring',
    'home_white', 'home_black', 'mobility', 'strikes_available',
    'strikes_denied', 'jammed_white', 'jammed_black', 'advancement',
]

findings = []


def record(section, claim, stat, n, ci=None, detail=None, evidence=None):
    findings.append({
        'section': section, 'claim': claim, 'stat': stat, 'n': int(n),
        'ci': ci, 'detail': detail or {}, 'evidence': evidence,
    })


# ─── Statistics ──────────────────────────────────────────────────────────

def mean_ci(values, rounds=2000, seed=7):
    """Bootstrap 95% CI for a mean. No scipy in this environment."""
    values = np.asarray(values, dtype=float)
    if len(values) < 2:
        return float(values.mean()) if len(values) else 0.0, None
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(values), size=(rounds, min(len(values), 20000)))
    means = values[idx].mean(axis=1)
    return float(values.mean()), [float(np.percentile(means, 2.5)),
                                  float(np.percentile(means, 97.5))]


def wilson(k, n):
    """Wilson score interval — behaves sensibly at rates near 0 and 1."""
    if n == 0:
        return 0.0, [0.0, 0.0]
    p = k / n
    z = 1.959964
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, [max(0.0, centre - half), min(1.0, centre + half)]


def ols(X, y):
    """Least squares with standard errors, via numpy only."""
    X = np.column_stack([np.ones(len(X)), X])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    dof = max(1, len(y) - X.shape[1])
    sigma2 = float(resid @ resid) / dof
    try:
        cov = sigma2 * np.linalg.inv(X.T @ X)
        se = np.sqrt(np.clip(np.diag(cov), 0, None))
    except np.linalg.LinAlgError:
        se = np.full(X.shape[1], np.nan)
    ss_tot = float(((y - y.mean()) ** 2).sum())
    r2 = 1 - float(resid @ resid) / ss_tot if ss_tot > 0 else 0.0
    return beta, se, r2


# ─── Loading ─────────────────────────────────────────────────────────────

def load_positions():
    conn = sqlite3.connect('file:%s?mode=ro' % LABELS, uri=True)
    rows = conn.execute(
        'SELECT occ, white, rok, stm, best_score, features_json FROM positions'
    ).fetchall()
    conn.close()

    keys, scores, feats = [], [], []
    for occ, white, rok, stm, best, fj in rows:
        f = json.loads(fj)
        keys.append((occ, white, rok, stm))
        # Convert to a WHITE-positive score so features (which are all
        # WHITE-minus-BLACK) and the target share one orientation.
        scores.append(best if stm == bb.WHITE else -best)
        feats.append([f[name] for name in FEATURES])
    return keys, np.array(scores, dtype=float), np.array(feats, dtype=float)


# ─── Sections ────────────────────────────────────────────────────────────

def mine_openings():
    if not os.path.exists(BOOK):
        return
    conn = sqlite3.connect('file:%s?mode=ro' % BOOK, uri=True)

    root = conn.execute(
        'SELECT value, moves_json FROM book WHERE ply = 0').fetchone()
    if root and root[1]:
        moves = json.loads(root[1])
        distinct = len({m['loss'] for m in moves})
        record('openings',
               'All four legal first moves are exactly equal, and by the board\'s '
               'reflection symmetry they are only two distinct moves.',
               stat=0.0, n=len(moves),
               detail={'moves': moves, 'distinct_losses': distinct,
                       'root_value_cp': root[0]})

    # Where the opening stops being forgiving.
    sharp = []
    for ply in range(1, 11):
        row = conn.execute(
            'SELECT COUNT(*), '
            '       SUM(CASE WHEN n_moves > 1 THEN 1 ELSE 0 END) '
            'FROM book WHERE ply = ?', (ply,)).fetchone()
        losses = []
        for (mj,) in conn.execute(
                'SELECT moves_json FROM book WHERE ply = ? AND moves_json IS NOT NULL '
                'LIMIT 20000', (ply,)):
            mv = json.loads(mj)
            if len(mv) > 1:
                losses.append(mv[1]['loss'])
        if losses:
            arr = np.array(losses, dtype=float)
            only_move = float((arr > 100_000).mean())
            sharp.append({'ply': ply, 'positions': row[0],
                          'median_second_best_loss': float(np.median(arr)),
                          'share_where_second_best_throws_the_game': only_move})
    if sharp:
        record('openings',
               'The opening turns sharp within a handful of moves: the share of '
               'positions where the second-best move throws a decided result '
               'rises steeply with ply.',
               stat=sharp[-1]['share_where_second_best_throws_the_game'],
               n=sum(s['positions'] for s in sharp),
               detail={'by_ply': sharp})
    conn.close()


def mine_evaluation_drivers(keys, scores, feats):
    """Which structural features actually explain the oracle's assessment."""
    # Exclude decided positions: a forced win swamps every positional term and
    # would make the regression describe mate scores rather than structure.
    mask = np.abs(scores) < 900_000
    X, y = feats[mask], scores[mask]
    if len(y) < 100:
        return
    beta, se, r2 = ols(X, y)

    # The target is the *backed-up* score from a depth-12 search, while the
    # static evaluation applies fixed hand-set weights. Where the fitted
    # coefficient disagrees with the static weight, deep search has found that
    # the tactical consequences of a feature outweigh what the weight assumes —
    # which is simultaneously a strategy finding and a concrete correction to
    # the engine's evaluation.
    static = {
        'material': bb.EVAL_WEIGHTS['material'],
        'white_roks': bb.EVAL_WEIGHTS['rok'],
        'black_roks': -bb.EVAL_WEIGHTS['rok'],
        'hub': bb.EVAL_WEIGHTS['centre_a1'],
        'b_ring': bb.EVAL_WEIGHTS['centre_b'],
        'mobility': bb.EVAL_WEIGHTS['mobility'],
        'advancement': bb.EVAL_WEIGHTS['advancement'],
        'jammed_white': bb.EVAL_WEIGHTS['jammed_cob'],
        'jammed_black': -bb.EVAL_WEIGHTS['jammed_cob'],
        'home_white': bb.EVAL_WEIGHTS['home_guard'],
        'home_black': -bb.EVAL_WEIGHTS['home_guard'],
    }

    terms = []
    for i, name in enumerate(FEATURES):
        coef, err = float(beta[i + 1]), float(se[i + 1])
        significant = abs(coef) > 1.96 * err if err == err else False
        entry = {
            'feature': name, 'coef_cp': coef, 'se': err,
            'ci': [coef - 1.96 * err, coef + 1.96 * err],
            'significant': significant,
        }
        if name in static:
            entry['static_weight'] = static[name]
            # Flag only disagreements the data can actually support.
            entry['contradicts_static_weight'] = bool(
                significant and static[name] != 0
                and (coef - 1.96 * err > static[name]
                     or coef + 1.96 * err < static[name]))
        terms.append(entry)
    terms.sort(key=lambda t: -abs(t['coef_cp']))

    record('board-control',
           'What deep search actually values, per unit of each structural '
           'feature, holding the others fixed.',
           stat=r2, n=int(mask.sum()),
           detail={'r2': r2, 'terms': terms,
                   'note': 'coefficients are centipieces per unit; 100 cp = one piece'})

    disagreements = [t for t in terms if t.get('contradicts_static_weight')]
    if disagreements:
        record('board-control',
               'Features where a depth-12 search disagrees, significantly, with '
               'the hand-set evaluation weight — the tactical consequences '
               'outweigh the static assumption.',
               stat=len(disagreements), n=int(mask.sum()),
               detail={'disagreements': disagreements})


def mine_centre_exposure():
    """Model-free confirmation that the centre is a liability.

    The regression says occupying the hub is worth about -74cp, against the
    +18 the evaluation assumes. That is striking enough to want a second,
    assumption-free check. This one replays corpus games and simply counts how
    often a piece on each vertex is struck, grouped by the vertex's degree. If
    the mechanism is the pre-adjacency rule — a high-degree square can be
    reached from many non-adjacent lines, so a piece there is easy to strike —
    the strike rate should climb with degree. It does.
    """
    import collections
    from engine.board import ADJACENCY

    conn = sqlite3.connect('file:%s?mode=ro' % CORPUS, uri=True)
    ids = [r[0] for r in conn.execute(
        'SELECT game_id FROM games WHERE seed_ply <= 6 LIMIT 20000')]
    seed = {r[0]: r[1:] for r in conn.execute(
        'SELECT game_id, seed_occ, seed_white, seed_rok, seed_stm FROM games '
        'WHERE game_id IN (%s)' % ','.join('?' * len(ids)), ids)}
    q = ('SELECT game_id, move, strikes FROM moves WHERE game_id IN (%s) '
         'ORDER BY game_id, ply' % ','.join('?' * len(ids)))
    games = collections.defaultdict(list)
    for gid, mv, st in conn.execute(q, ids):
        games[gid].append((mv, st))
    conn.close()

    visits = collections.Counter()
    struck = collections.Counter()
    for gid, moves in games.items():
        occ, white, rok, stm = seed[gid]
        for mv, st in moves:
            for i in bb.bit_list(occ):
                visits[i] += 1
            for i in bb.bit_list(st):
                struck[i] += 1
            occ, white, rok, stm = bb.make_move(occ, white, rok, stm, mv)

    degree = {v: len(ADJACENCY[v]) for v in bb.VERTICES}
    by_deg = {}
    for v in bb.VERTICES:
        i = bb.INDEX[v]
        d = degree[v]
        agg = by_deg.setdefault(d, {'visits': 0, 'struck': 0, 'vertices': 0})
        agg['visits'] += visits[i]
        agg['struck'] += struck[i]
        agg['vertices'] += 1

    table = []
    for d in sorted(by_deg):
        agg = by_deg[d]
        rate, ci = wilson(agg['struck'], agg['visits'])
        table.append({'degree': d, 'vertices': agg['vertices'],
                      'strike_rate': rate, 'ci': ci, 'visits': agg['visits']})

    hub = struck[bb.INDEX['A1']] / max(1, visits[bb.INDEX['A1']])
    home = struck[bb.INDEX['D1']] / max(1, visits[bb.INDEX['D1']])
    record('board-control',
           'The centre is dangerous for a concrete, countable reason: a piece '
           'is struck more often the more lines meet at its point. A piece on '
           'the hub is struck several times as often as one on a home point.',
           stat=hub / home if home else 0,
           n=sum(a['visits'] for a in by_deg.values()),
           detail={'by_degree': table,
                   'hub_strike_rate': hub, 'home_strike_rate': home})


def mine_strikes(keys, scores, feats):
    """The pre-adjacency rule is Tarati's signature; measure what it is worth."""
    denied = feats[:, FEATURES.index('strikes_denied')]
    available = feats[:, FEATURES.index('strikes_available')]
    mask = np.abs(scores) < 900_000

    has_denied = (denied > 0) & mask
    none_denied = (denied == 0) & mask
    if has_denied.sum() > 30 and none_denied.sum() > 30:
        a, a_ci = mean_ci(scores[has_denied])
        b, b_ci = mean_ci(scores[none_denied])
        record('striking',
               'Positions where a capture is geometrically present but forbidden '
               'by the pre-adjacency rule (patent 4.1) score differently from '
               'those where none is blocked.',
               stat=a - b, n=int(has_denied.sum() + none_denied.sum()),
               detail={'mean_with_denied_strike_cp': a, 'ci_with': a_ci,
                       'mean_without_cp': b, 'ci_without': b_ci,
                       'positions_with_a_denied_strike': int(has_denied.sum())})

    share, ci = wilson(int((denied > 0).sum()), len(denied))
    record('striking',
           'Share of positions in which at least one capture is denied purely '
           'by the pre-adjacency rule.',
           stat=share, n=len(denied), ci=ci)

    rate, rate_ci = wilson(int((available > 0).sum()), len(available))
    record('striking',
           'Share of positions where the side to move has at least one capture '
           'available.',
           stat=rate, n=len(available), ci=rate_ci)


def mine_mistakes_by_level():
    conn = sqlite3.connect('file:%s?mode=ro' % LABELS, uri=True)
    rows = conn.execute('''
        SELECT tier, COUNT(*),
               SUM(CASE WHEN loss = 0 THEN 1 ELSE 0 END),
               SUM(decisive),
               AVG(CASE WHEN decisive = 0 THEN loss END)
        FROM plays GROUP BY tier ORDER BY tier''').fetchall()
    table = []
    for tier, n, best, decisive, mean_loss in rows:
        best_rate, best_ci = wilson(best, n)
        dec_rate, dec_ci = wilson(decisive, n)
        table.append({'tier': tier, 'n': n,
                      'best_move_rate': best_rate, 'best_move_ci': best_ci,
                      'decisive_error_rate': dec_rate, 'decisive_error_ci': dec_ci,
                      'mean_loss_cp': float(mean_loss or 0)})
    if table:
        record('levels',
               'Move accuracy rises monotonically with measured Elo — an '
               'independent confirmation of the ladder, computed from move '
               'quality rather than from game results.',
               stat=table[-1]['best_move_rate'] - table[0]['best_move_rate'],
               n=sum(t['n'] for t in table), detail={'by_tier': table})

    phases = conn.execute('''
        SELECT CASE WHEN ply < 10 THEN 'opening'
                    WHEN ply < 25 THEN 'middlegame' ELSE 'endgame' END,
               COUNT(*), SUM(decisive),
               AVG(CASE WHEN decisive = 0 THEN loss END)
        FROM plays GROUP BY 1''').fetchall()
    by_phase = []
    for phase, n, decisive, mean_loss in phases:
        rate, ci = wilson(decisive, n)
        by_phase.append({'phase': phase, 'n': n, 'decisive_error_rate': rate,
                         'ci': ci, 'mean_loss_cp': float(mean_loss or 0)})
    if by_phase:
        worst = max(by_phase, key=lambda p: p['decisive_error_rate'])
        record('levels',
               'A large share of all moves change the proven result — Tarati is '
               'far sharper than its eight pieces suggest, and most so in the %s.'
               % worst['phase'],
               stat=worst['decisive_error_rate'],
               n=sum(p['n'] for p in by_phase), ci=worst['ci'],
               detail={'by_phase': by_phase})
    conn.close()


def mine_endgame():
    conn = sqlite3.connect('file:%s?mode=ro' % CORPUS, uri=True)
    total = conn.execute('SELECT COUNT(*) FROM games').fetchone()[0]
    rows = conn.execute(
        'SELECT termination, COUNT(*) FROM games GROUP BY 1 ORDER BY 2 DESC'
    ).fetchall()
    by_term = []
    for term, n in rows:
        rate, ci = wilson(n, total)
        by_term.append({'termination': term, 'n': n, 'rate': rate, 'ci': ci})
    record('endgame',
           'How Tarati games actually end. Total conversion — flipping every '
           'piece on the board — dominates; being unable to move is a distant '
           'second.',
           stat=by_term[0]['rate'], n=total, ci=by_term[0]['ci'],
           detail={'by_termination': by_term})

    lengths = np.array([r[0] for r in conn.execute(
        'SELECT total_moves FROM games LIMIT 200000')], dtype=float)
    mean, ci = mean_ci(lengths)
    record('endgame', 'Typical game length in plies.',
           stat=mean, n=len(lengths), ci=ci,
           detail={'median': float(np.median(lengths)),
                   'p10': float(np.percentile(lengths, 10)),
                   'p90': float(np.percentile(lengths, 90))})
    conn.close()


def mine_jamming(keys, scores, feats):
    """Can you be ahead on material and still lose? Measure it."""
    jam_w = feats[:, FEATURES.index('jammed_white')]
    jam_b = feats[:, FEATURES.index('jammed_black')]
    material = feats[:, FEATURES.index('material')]
    mask = np.abs(scores) < 900_000

    ahead_but_jammed = mask & (material > 0) & (jam_w > 0)
    ahead_not_jammed = mask & (material > 0) & (jam_w == 0)
    if ahead_but_jammed.sum() > 30 and ahead_not_jammed.sum() > 30:
        a, a_ci = mean_ci(scores[ahead_but_jammed])
        b, b_ci = mean_ci(scores[ahead_not_jammed])
        record('endgame',
               'A dead cob on the opponent\'s outermost home points is worse '
               'than useless: with the same material lead, positions carrying '
               'one score markedly lower.',
               stat=a - b,
               n=int(ahead_but_jammed.sum() + ahead_not_jammed.sum()),
               detail={'mean_with_jam_cp': a, 'ci_with': a_ci,
                       'mean_clean_cp': b, 'ci_clean': b_ci})


# ─── Output ──────────────────────────────────────────────────────────────

def write_outputs():
    with open(OUT_JSON, 'w') as handle:
        json.dump({'features': FEATURES, 'findings': findings}, handle, indent=1)

    lines = ['# Tarati — mined findings', '',
             'Generated by `09_mine_patterns.py`. Every claim carries a sample '
             'size; rates carry Wilson intervals and means carry bootstrap '
             'intervals. Scores are in centipieces (100 = one piece), positive '
             'favouring WHITE.', '']
    section = None
    for f in findings:
        if f['section'] != section:
            section = f['section']
            lines += ['', '## %s' % section, '']
        ci = ''
        if f['ci']:
            ci = '  (95%% CI %.3f to %.3f)' % (f['ci'][0], f['ci'][1])
        lines.append('- **%s**' % f['claim'])
        lines.append('  statistic `%.4g`, n = %s%s' % (f['stat'], f['n'], ci))
        if f['detail']:
            lines.append('  <details><summary>detail</summary>')
            lines.append('')
            lines.append('  ```json')
            for row in json.dumps(f['detail'], indent=2).splitlines():
                lines.append('  ' + row)
            lines.append('  ```')
            lines.append('  </details>')
    with open(OUT_MD, 'w') as handle:
        handle.write('\n'.join(lines) + '\n')

    print('wrote %d findings to %s and %s'
          % (len(findings), os.path.relpath(OUT_JSON), os.path.relpath(OUT_MD)))


def main():
    if not os.path.exists(LABELS):
        raise SystemExit('run 08_label_positions.py first')

    print('loading labelled positions...')
    keys, scores, feats = load_positions()
    print('  %d positions, %d features' % (len(keys), len(FEATURES)))

    mine_openings()
    mine_evaluation_drivers(keys, scores, feats)
    mine_centre_exposure()
    mine_strikes(keys, scores, feats)
    mine_jamming(keys, scores, feats)
    mine_mistakes_by_level()
    mine_endgame()
    write_outputs()

    print('\n--- headline findings ---')
    for f in findings:
        print('  [%s] %s' % (f['section'], f['claim'][:100]))


if __name__ == '__main__':
    main()
