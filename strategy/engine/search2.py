"""search2.py — experimental engine variants, benchmarked before adoption.

Nothing here is shipped until `10_engine_lab.py` shows it wins games. The
production engine (`ai.py` + `bitboard.py`) is pinned to `src/AI.js` by a golden
parity fixture, so a speculative change there costs a fixture regeneration and a
JS port; keeping the candidates in their own module makes an experiment cheap.

Every variant is a flag on one search, so the gauntlet can attribute the Elo it
gains to the flag that caused it.

Two facts about Tarati shape the design, and both were measured rather than
assumed:

* **The board always holds exactly eight pieces.** A strike converts an enemy
  piece, it never removes one (`bitboard.make_move`), so occupancy is invariant
  for the whole game. One strike is therefore a *two-piece* swing — you gain one
  and the opponent loses one — which is why a depth-12 regression prices the
  material feature at 136 cp when the static table says 100.
* **The position is quiet almost nowhere.** Because a strike is a two-swing and
  it triggers on arrival rather than on the target square, a static evaluation
  taken mid-exchange is off by hundreds of centipieces. The production search
  has no quiescence, and its root score at the symmetric start oscillates by
  parity at every depth from 5 to 14 — the signature of exactly that.

Null-move pruning is deliberately absent. Tarati has a real tempo effect: a
cob's move is irreversible, so being obliged to move is often a genuine
disadvantage and the null-move observation ("passing cannot help you") is
false here.
"""

import math
import random
import time

from . import bitboard as bb
from .bitboard import ADJ, HOME, DEAD, RANK_OF, FULL, WHITE, BLACK, N_VERTICES, INDEX

WINNING_SCORE = 1_000_000
MAX_SEARCH_PLY = 256
MATE_THRESHOLD = WINNING_SCORE - MAX_SEARCH_PLY

_EXACT, _LOWER, _UPPER = 0, 1, 2


class SearchAborted(Exception):
    """Budget exhausted; the root falls back to the last completed iteration."""


# ─── Evaluation ──────────────────────────────────────────────────────────
#
# Weight sets are named so a gauntlet result can name the thing it measured.
#
# `static` is the shipped table. `mined` is what a depth-12 search actually
# prices each feature at, read off the regression in `data/findings.json`
# (n = 92,769 labelled positions, all coefficients significant). Three of those
# coefficients have the *opposite sign* to the shipped weight: the A1 hub is
# priced at -74 against a shipped +18, the B-ring at -37 against +10, and home
# occupancy at -8 against +8. The shipped table pays you to sit in the centre;
# deep search charges you for it, because a high-degree vertex is a vertex where
# more enemies can arrive next to you.

WEIGHTS = {
    'static': {
        'material':    100, 'rok':          60, 'centre_a1':    18,
        'centre_b':     10, 'advancement':   4, 'mobility':      3,
        'home_guard':    8, 'jammed_cob':  -25, 'threat':        0,
    },
    # Regression coefficients, scaled so material stays at 100.
    'mined': {
        'material':    100, 'rok':          41, 'centre_a1':   -55,
        'centre_b':    -28, 'advancement':   0, 'mobility':     23,
        'home_guard':   -6, 'jammed_cob':  -31, 'threat':        0,
    },
    # The same, plus an explicit one-ply strike-threat term. A strike is a
    # two-piece swing, so a piece the opponent can flip on the move is worth
    # far less than one they cannot reach.
    'mined_threat': {
        'material':    100, 'rok':          41, 'centre_a1':   -55,
        'centre_b':    -28, 'advancement':   0, 'mobility':     23,
        'home_guard':   -6, 'jammed_cob':  -31, 'threat':      -55,
    },
    # Threat term on top of the shipped table, to separate the two effects:
    # if `static_threat` gains most of what `mined_threat` gains, the win is
    # tactical awareness rather than repricing.
    'static_threat': {
        'material':    100, 'rok':          60, 'centre_a1':    18,
        'centre_b':     10, 'advancement':   4, 'mobility':      3,
        'home_guard':    8, 'jammed_cob':  -25, 'threat':      -55,
    },
}


def build_tables(w):
    """Per-square value tables, as in `bitboard.set_weights`.

    Kept colour-symmetric by construction: every term is built on RANK, which
    is antisymmetric under the board's 180 degree automorphism, or on vertex
    sets that map onto their opposite under it. That symmetry is the test that
    makes any colour skew at equal strength diagnosable as a bug.
    """
    cob = ([], [])
    rk = ([], [])
    for colour in (WHITE, BLACK):
        for i in range(N_VERTICES):
            bit = 1 << i
            common = w['material']
            if i == INDEX['A1']:
                common += w['centre_a1']
            elif bb.VERTICES[i][0] == 'B':
                common += w['centre_b']
            if HOME[colour] & bit:
                common += w['home_guard']
            advance = (bb.MAX_RANK - RANK_OF[i]) if colour == WHITE else RANK_OF[i]
            value = common + w['advancement'] * advance
            if DEAD[colour] & bit:
                value += w['jammed_cob']
            cob[colour].append(value)
            rk[colour].append(common + w['rok'])
    return ((tuple(cob[WHITE]), tuple(cob[BLACK])),
            (tuple(rk[WHITE]), tuple(rk[BLACK])))


def threatened(occ, white, rok, stm):
    """Mask of enemy pieces the side to move can flip with a single move.

    Uses the pre-adjacency rule of patent section 4.1 directly: a move from
    `src` to `dst` flips every enemy adjacent to `dst` that was *not* already
    adjacent to `src`. Walking destinations rather than moves means the
    mobility count falls out of the same loop.
    """
    own = white if stm == WHITE else occ & ~white
    enemy = (occ & ~white) if stm == WHITE else white
    empty = FULL & ~occ
    free = own & (rok | HOME[stm])
    fwd = bb.FWD[stm]

    victims = 0
    for i in bb.bit_list(free):
        src_adj = ADJ[i]
        for t in bb.bit_list(src_adj & empty):
            victims |= ADJ[t] & ~src_adj & enemy
    for i in bb.bit_list(own & ~free):
        src_adj = ADJ[i]
        for t in bb.bit_list(fwd[i] & empty):
            victims |= ADJ[t] & ~src_adj & enemy
    return victims


class Evaluator:
    """Static evaluation in centipieces, positive favouring WHITE."""

    __slots__ = ('cob', 'rok', 'mobility_w', 'threat_w', 'name')

    def __init__(self, name='static'):
        self.name = name
        w = WEIGHTS[name]
        self.cob, self.rok = build_tables(w)
        self.mobility_w = w['mobility']
        self.threat_w = w['threat']

    def __call__(self, occ, white, rok, stm):
        black = occ & ~white
        w_cob, b_cob = self.cob
        w_rok, b_rok = self.rok

        score = 0
        for i in bb.bit_list(white & ~rok):
            score += w_cob[i]
        for i in bb.bit_list(white & rok):
            score += w_rok[i]
        for i in bb.bit_list(black & ~rok):
            score -= b_cob[i]
        for i in bb.bit_list(black & rok):
            score -= b_rok[i]

        if self.mobility_w:
            score += self.mobility_w * (bb.mobility(occ, white, rok, WHITE)
                                        - bb.mobility(occ, white, rok, BLACK))
        if self.threat_w:
            # Only the side to move can execute its threats now, so the two
            # sides are not symmetric here and must be counted separately.
            hanging = threatened(occ, white, rok, stm)
            if stm == WHITE:
                score -= self.threat_w * (hanging & black).bit_count()
            else:
                score += self.threat_w * (hanging & white).bit_count()
        return score


# ─── Move ordering ───────────────────────────────────────────────────────

def strike_count(occ, white, rok, stm, move):
    """How many enemy pieces this move flips. Never applies the move."""
    src, dst = move >> 5, move & 31
    if src == dst:
        return 0
    enemy = (occ & ~white) if stm == WHITE else white
    return (ADJ[dst] & ~ADJ[src] & enemy & ~(1 << src)).bit_count()


def order_score(occ, white, rok, stm, move, tt_move, killers, history):
    if move == tt_move:
        return 1 << 30
    src, dst = move >> 5, move & 31
    if src == dst:
        return 5_000
    n = strike_count(occ, white, rok, stm, move)
    if n:
        # A strike is a two-piece swing, so it outranks every quiet heuristic.
        return (1 << 28) + n * 1000
    if move == killers[0]:
        return 1 << 27
    if move == killers[1]:
        return (1 << 27) - 1
    score = history.get((stm, move), 0)
    if not ((rok >> src) & 1) and (HOME[stm ^ 1] & (1 << dst)):
        score += 400
    return score


# ─── Search ──────────────────────────────────────────────────────────────

class Engine:
    """One configuration of the experimental search.

    Flags
    -----
    eval_name  : which weight set to evaluate with
    quiescence : extend past the horizon over strikes and promotions
    qdepth     : ply cap on that extension
    ordering   : killer moves + history heuristic
    pvs        : null-window search on non-first moves, re-searched on fail-high
    tt_ge      : reuse a table entry searched at greater-or-equal depth

    `tt_ge` is off by default and is a playing-strength flag only. In
    fixed-depth minimax the depth-8 value of a position is a different quantity
    from its depth-5 value, so reusing the deeper entry makes the score depend
    on search history. That is fatal for the oracle, which must be a pure
    function of the position, but it is free strength in a game.
    """

    def __init__(self, eval_name='static', quiescence=False, qdepth=6,
                 ordering=False, pvs=False, tt_ge=False):
        self.evaluate = Evaluator(eval_name)
        self.quiescence = quiescence
        self.qdepth = qdepth
        self.ordering = ordering
        self.pvs = pvs
        self.tt_ge = tt_ge
        self.nodes = 0
        self.qnodes = 0
        self._reset_tables()

    def _reset_tables(self):
        self.tt_values = {}
        self.tt_moves = {}
        self.killers = [[-1, -1] for _ in range(MAX_SEARCH_PLY)]
        self.history = {}
        self.ctx = None

    # -- budget --

    def _tick(self):
        ctx = self.ctx
        if ctx is None:
            return
        self.nodes += 1
        if ctx['max_nodes'] is not None and self.nodes >= ctx['max_nodes']:
            raise SearchAborted
        if ctx['deadline'] is not None and (self.nodes & 255) == 0:
            if time.perf_counter() >= ctx['deadline']:
                raise SearchAborted

    # -- quiescence --

    def _quiesce(self, occ, white, rok, stm, alpha, beta, ply, qleft):
        """Stand-pat, then search only moves that change material or rank.

        Without this the search stops mid-exchange and scores a position whose
        static value is about to move by 200 cp. The forcing set is strikes
        plus promotions: a promotion is the one other move that changes a
        piece's value rather than its square.
        """
        self._tick()
        self.qnodes += 1

        stand = self.evaluate(occ, white, rok, stm)
        if stm != WHITE:
            stand = -stand
        if stand >= beta:
            return stand
        if stand > alpha:
            alpha = stand
        if qleft <= 0:
            return stand

        moves = bb.gen_moves(occ, white, rok, stm)
        if not moves:
            return -(WINNING_SCORE - ply)

        forcing = []
        for m in moves:
            src, dst = m >> 5, m & 31
            if src == dst:
                continue
            n = strike_count(occ, white, rok, stm, m)
            promotes = (not ((rok >> src) & 1)) and bool(HOME[stm ^ 1] & (1 << dst))
            if n or promotes:
                forcing.append((n, m))
        if not forcing:
            return stand
        forcing.sort(reverse=True)

        best = stand
        for _n, m in forcing:
            c = bb.make_move(occ, white, rok, stm, m)
            score = -self._quiesce(c[0], c[1], c[2], c[3],
                                   -beta, -alpha, ply + 1, qleft - 1)
            if score > best:
                best = score
            if best > alpha:
                alpha = best
            if alpha >= beta:
                break
        return best

    # -- main search --

    def _search(self, occ, white, rok, stm, depth, alpha, beta, ply):
        self._tick()
        alpha_orig = alpha
        key = bb.zobrist(occ, white, rok, stm)
        tt_move = self.tt_moves.get(key, -1)

        entry = self.tt_values.get((key, depth))
        if entry is None and self.tt_ge:
            for d in range(depth + 1, depth + 7):
                entry = self.tt_values.get((key, d))
                if entry is not None:
                    break
        if entry is not None:
            value, flag = entry
            if value > MATE_THRESHOLD:
                value -= ply
            elif value < -MATE_THRESHOLD:
                value += ply
            if flag == _EXACT:
                return value
            if flag == _LOWER:
                alpha = max(alpha, value)
            else:
                beta = min(beta, value)
            if alpha >= beta:
                return value

        moves = bb.gen_moves(occ, white, rok, stm)
        if not moves:
            return -(WINNING_SCORE - ply)
        black = occ & ~white
        if not black or not white:
            loser = BLACK if not black else WHITE
            return (-(WINNING_SCORE - ply) if loser == stm else WINNING_SCORE - ply)

        if depth <= 0:
            if self.quiescence:
                return self._quiesce(occ, white, rok, stm, alpha, beta, ply,
                                     self.qdepth)
            score = self.evaluate(occ, white, rok, stm)
            return score if stm == WHITE else -score

        if len(moves) > 1:
            if self.ordering:
                k = self.killers[ply]
                moves.sort(key=lambda m: order_score(occ, white, rok, stm, m,
                                                     tt_move, k, self.history),
                           reverse=True)
            else:
                moves.sort(key=lambda m: bb.order_score(occ, white, rok, stm,
                                                        m, tt_move),
                           reverse=True)

        best_score = -math.inf
        best_move = -1
        for index, move in enumerate(moves):
            c = bb.make_move(occ, white, rok, stm, move)
            if self.pvs and index > 0 and alpha > -math.inf:
                score = -self._search(c[0], c[1], c[2], c[3], depth - 1,
                                      -alpha - 1, -alpha, ply + 1)
                if alpha < score < beta:
                    score = -self._search(c[0], c[1], c[2], c[3], depth - 1,
                                          -beta, -alpha, ply + 1)
            else:
                score = -self._search(c[0], c[1], c[2], c[3], depth - 1,
                                      -beta, -alpha, ply + 1)

            if score > best_score:
                best_score, best_move = score, move
            if best_score > alpha:
                alpha = best_score
            if alpha >= beta:
                if self.ordering and not strike_count(occ, white, rok, stm, move):
                    k = self.killers[ply]
                    if k[0] != move:
                        k[1] = k[0]
                        k[0] = move
                    self.history[(stm, move)] = \
                        self.history.get((stm, move), 0) + depth * depth
                break

        stored = best_score
        if stored > MATE_THRESHOLD:
            stored += ply
        elif stored < -MATE_THRESHOLD:
            stored -= ply
        flag = (_UPPER if best_score <= alpha_orig
                else _LOWER if best_score >= beta else _EXACT)
        self.tt_values[(key, depth)] = (stored, flag)
        if best_move >= 0:
            self.tt_moves[key] = best_move
        return best_score

    # -- root --

    def search_root(self, occ, white, rok, stm, depth=8, max_nodes=None,
                    max_ms=None, temperature=0.0, stochastic_top_k=1,
                    randomize=False, rng=None, blunder_rate=0.0):
        """Iterative deepening. Returns (move, scored, completed_depth).

        Root moves are searched with a full window whenever `temperature` is on,
        because a narrowed window makes every sibling score after the first a
        bound rather than a value and the softmax would then be sampling from
        noise. At temperature 0 only the argmax matters and PVS is safe.
        """
        rng = rng or random
        self._reset_tables()
        self.nodes = self.qnodes = 0
        moves = bb.gen_moves(occ, white, rok, stm)
        if not moves:
            return None, [], 0

        self.ctx = None if (max_nodes is None and max_ms is None) else {
            'max_nodes': max_nodes,
            'deadline': None if max_ms is None else time.perf_counter() + max_ms / 1000.0,
        }

        completed, completed_depth = None, 0
        for d in range(1, max(1, depth) + 1):
            try:
                scored = self._root_scores(occ, white, rok, stm, d,
                                           exact=bool(temperature))
            except SearchAborted:
                break
            completed, completed_depth = scored, d
            if abs(scored[0][1]) > MATE_THRESHOLD:
                break

        if completed is None:
            completed = [(m, 0) for m in moves]

        if randomize and temperature and stochastic_top_k > 1:
            best = completed[0][1]
            cand = completed[:stochastic_top_k]
            w = [math.exp((s - best) / temperature) for _, s in cand]
            chosen = rng.choices([m for m, _ in cand], weights=w, k=1)[0]
        else:
            top = [m for m, s in completed if s == completed[0][1]]
            chosen = rng.choice(top) if randomize else top[0]

        if blunder_rate and len(completed) > 1 and rng.random() < blunder_rate:
            chosen = rng.choice([m for m, _ in completed[1:3]])

        return chosen, completed, completed_depth

    def _root_scores(self, occ, white, rok, stm, depth, exact):
        moves = bb.gen_moves(occ, white, rok, stm)
        hint = self.tt_moves.get(bb.zobrist(occ, white, rok, stm), -1)
        k = self.killers[0]
        if self.ordering:
            moves.sort(key=lambda m: order_score(occ, white, rok, stm, m, hint,
                                                 k, self.history), reverse=True)
        else:
            moves.sort(key=lambda m: bb.order_score(occ, white, rok, stm, m, hint),
                       reverse=True)

        scored = []
        alpha = -math.inf
        for index, move in enumerate(moves):
            c = bb.make_move(occ, white, rok, stm, move)
            if exact or not self.pvs or index == 0 or alpha == -math.inf:
                score = -self._search(c[0], c[1], c[2], c[3], depth - 1,
                                      -math.inf, math.inf, 1)
            else:
                score = -self._search(c[0], c[1], c[2], c[3], depth - 1,
                                      -alpha - 1, -alpha, 1)
                if score > alpha:
                    score = -self._search(c[0], c[1], c[2], c[3], depth - 1,
                                          -math.inf, math.inf, 1)
            scored.append((move, score))
            if score > alpha:
                alpha = score
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored


#: Named variants the gauntlet plays. `base` reproduces the shipped engine's
#: search so that a gauntlet score of 50% against it is the null result.
VARIANTS = {
    'base':      dict(),
    'order':     dict(ordering=True, pvs=True),
    'quiet':     dict(quiescence=True),
    'mined':     dict(eval_name='mined'),
    'threat':    dict(eval_name='static_threat'),
    'quiet+ord': dict(quiescence=True, ordering=True, pvs=True),
    'mined+q':   dict(eval_name='mined', quiescence=True, ordering=True, pvs=True),
    'full':      dict(eval_name='mined_threat', quiescence=True, ordering=True,
                      pvs=True),
    'full+ttge': dict(eval_name='mined_threat', quiescence=True, ordering=True,
                      pvs=True, tt_ge=True),
}


def make(variant):
    return Engine(**VARIANTS[variant])
