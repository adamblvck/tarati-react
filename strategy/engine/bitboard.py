"""Integer-bitboard core — the hot path for search, oracle and corpus runs.

A position is four plain integers: ``occ``, ``white``, ``rok`` and ``stm``.
Twenty-three vertices fit in 23 bits, so a whole board is three machine words
and every operation is a mask op. Nothing is allocated per node, which is the
main win over the dict-of-dicts representation: profiling the corrected
dict engine showed ``apply_move_to_board`` (a full dict copy per node) as the
single largest cost.

The same encoding is mirrored in ``src/AI.js`` — 23 bits sits comfortably
inside JavaScript's 32-bit bitwise operators — so both engines hash, order and
evaluate identically. ``test_parity.py`` and ``src/__tests__/aiParity.test.js``
check that against a shared golden fixture.

Colours are ``WHITE = 0`` and ``BLACK = 1`` so they can index tuples directly.

Move encoding: ``(from << 5) | to``. A move with ``from == to`` is the
dead-piece promotion of patent §6.3.
"""

from .board import (
    VERTICES, ADJACENCY, HOME_BASES, FORWARD, DEAD_POSITIONS, RANK, MAX_RANK,
    ROTATION,
)

WHITE, BLACK = 0, 1
N_VERTICES = len(VERTICES)
FULL = (1 << N_VERTICES) - 1

INDEX = {v: i for i, v in enumerate(VERTICES)}
VERTEX = {i: v for v, i in INDEX.items()}

_COLOR_NAME = ('WHITE', 'BLACK')


def _mask(vertices):
    m = 0
    for v in vertices:
        m |= 1 << INDEX[v]
    return m


# -- Precomputed topology --------------------------------------------------

ADJ = tuple(_mask(ADJACENCY[v]) for v in VERTICES)
FWD = tuple(
    tuple(_mask(FORWARD[_COLOR_NAME[c]][v]) for v in VERTICES)
    for c in (WHITE, BLACK)
)
HOME = (_mask(HOME_BASES['WHITE']), _mask(HOME_BASES['BLACK']))
DEAD = (_mask(DEAD_POSITIONS['WHITE']), _mask(DEAD_POSITIONS['BLACK']))
RANK_OF = tuple(RANK[v] for v in VERTICES)
ROTATE = tuple(INDEX[ROTATION[v]] for v in VERTICES)

INITIAL = (
    _mask(['C1', 'C2', 'D1', 'D2', 'C7', 'C8', 'D3', 'D4']),  # occ
    _mask(['C1', 'C2', 'D1', 'D2']),                          # white
    0,                                                        # rok
    WHITE,                                                    # stm
)


def bits(mask):
    """Yield the index of each set bit, lowest first."""
    while mask:
        low = mask & -mask
        yield low.bit_length() - 1
        mask ^= low


#: Memo for bit decomposition. Generator overhead dominated the first bitboard
#: profile — `bits` alone accounted for a third of search time across 2.1M
#: calls. Returning a cached tuple turns the inner loop into one dict lookup.
#: Most masks that reach this are adjacency intersections (`ADJ[i] & empty`),
#: which are subsets of a <=6-bit set, so a small number of distinct values
#: covers the vast majority of lookups.
_BIT_CACHE = {0: ()}
_BIT_CACHE_LIMIT = 300_000


def bit_list(mask):
    """Tuple of set-bit indices, memoised."""
    cached = _BIT_CACHE.get(mask)
    if cached is not None:
        return cached
    out = []
    m = mask
    while m:
        low = m & -m
        out.append(low.bit_length() - 1)
        m ^= low
    out = tuple(out)
    if len(_BIT_CACHE) < _BIT_CACHE_LIMIT:
        _BIT_CACHE[mask] = out
    return out


# -- Zobrist hashing -------------------------------------------------------
# Fixed constants rather than random ones so Python and JavaScript agree and so
# runs are reproducible across processes. Derived from a splitmix64 walk of a
# fixed seed; the JS port uses the identical table.

def _splitmix64(state):
    state = (state + 0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFFFFFF
    z = state
    z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & 0xFFFFFFFFFFFFFFFF
    z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & 0xFFFFFFFFFFFFFFFF
    return state, z ^ (z >> 31)


def _build_zobrist():
    state = 0x0DDBA11
    table = []
    for _ in range(N_VERTICES * 4):  # vertex x {white,black} x {cob,rok}
        state, value = _splitmix64(state)
        table.append(value)
    state, side = _splitmix64(state)
    return tuple(table), side


ZOBRIST, ZOBRIST_SIDE = _build_zobrist()


def zobrist(occ, white, rok, stm):
    """Full position hash. Cheap enough that incremental update is unnecessary
    at this board size, and far cheaper than sorting the piece list."""
    h = ZOBRIST_SIDE if stm else 0
    for i in bit_list(occ):
        colour = 0 if (white >> i) & 1 else 1
        rank = 1 if (rok >> i) & 1 else 0
        h ^= ZOBRIST[(i << 2) | (colour << 1) | rank]
    return h


# -- Move generation -------------------------------------------------------

def gen_moves(occ, white, rok, stm):
    """Legal moves for the side to move, patent §3 and §6.3."""
    own = white if stm == WHITE else occ & ~white
    empty = FULL & ~occ
    free = own & (rok | HOME[stm])   # roks (§3.3) and cobs at home (§3.2)
    forward_table = FWD[stm]

    moves = []
    for i in bit_list(free):
        for t in bit_list(ADJ[i] & empty):
            moves.append((i << 5) | t)
    for i in bit_list(own & ~free):
        for t in bit_list(forward_table[i] & empty):
            moves.append((i << 5) | t)

    if moves:
        return moves

    # No normal move — a dead cob may be promoted so that it can move (§6.3).
    for i in bit_list(own & ~rok & DEAD[stm]):
        if ADJ[i] & empty:
            moves.append((i << 5) | i)
    return moves


def has_moves(occ, white, rok, stm):
    """Cheaper than building the full list when only existence matters."""
    own = white if stm == WHITE else occ & ~white
    empty = FULL & ~occ
    free = own & (rok | HOME[stm])
    for i in bit_list(free):
        if ADJ[i] & empty:
            return True
    forward_table = FWD[stm]
    for i in bit_list(own & ~free):
        if forward_table[i] & empty:
            return True
    for i in bit_list(own & ~rok & DEAD[stm]):
        if ADJ[i] & empty:
            return True
    return False


def make_move(occ, white, rok, stm, move):
    """Apply `move` and return (occ, white, rok, stm) with the turn toggled.

    Mirrors board.apply_move_to_board exactly, including the fact that a
    captured piece is never promoted: the promotion branch guarding struck
    pieces in the dict engine is unreachable (its inner test contradicts its
    outer one), and the rule it would implement is covered by §5.2 anyway.
    """
    src = move >> 5
    dst = move & 31

    if src == dst:                       # dead-piece promotion in place (§6.3)
        return occ, white, rok | (1 << src), stm ^ 1

    src_bit = 1 << src
    dst_bit = 1 << dst
    mover_is_white = (white >> src) & 1

    occ = (occ ^ src_bit) | dst_bit
    if mover_is_white:
        white = (white ^ src_bit) | dst_bit
    if (rok >> src) & 1:
        rok = (rok ^ src_bit) | dst_bit
    elif HOME[stm ^ 1] & dst_bit:        # promotion on the far home base (§5.1)
        rok |= dst_bit

    # Strike (§4): every enemy adjacent to the destination that the mover was
    # not already adjacent to before moving (§4.1, the pre-adjacency rule).
    enemy = (occ & ~white) if mover_is_white else white
    victims = ADJ[dst] & ~ADJ[src] & enemy
    if victims:
        if mover_is_white:
            white |= victims
        else:
            white &= ~victims

    # Sole remaining piece of a colour must be promoted (§6.4).
    black = occ & ~white
    if white.bit_count() == 1 and not (white & rok):
        rok |= white
    if black.bit_count() == 1 and not (black & rok):
        rok |= black

    return occ, white, rok, stm ^ 1


def move_strikes(occ, white, rok, stm, move):
    """The mask of pieces this move would flip — used for corpus records."""
    src = move >> 5
    dst = move & 31
    if src == dst:
        return 0
    mover_is_white = (white >> src) & 1
    occ_after = (occ ^ (1 << src)) | (1 << dst)
    white_after = (white ^ (1 << src)) | (1 << dst) if mover_is_white else white
    enemy = (occ_after & ~white_after) if mover_is_white else white_after
    return ADJ[dst] & ~ADJ[src] & enemy


# -- Terminal detection ----------------------------------------------------

def terminal_loser(occ, white, rok, stm):
    """Colour that has lost, or None. Patent §7.1."""
    black = occ & ~white
    if not black:
        return BLACK
    if not white:
        return WHITE
    if not has_moves(occ, white, rok, stm):
        return stm
    return None


# -- Evaluation ------------------------------------------------------------

EVAL_WEIGHTS = {
    'material':    100,
    'rok':          60,
    'centre_a1':    18,
    'centre_b':     10,
    'advancement':   4,
    'mobility':      3,
    'home_guard':    8,
    'jammed_cob':  -25,
}

#: Per-square value tables, rebuilt by set_weights(). Indexed [colour][vertex].
COB_VALUE = None
ROK_VALUE = None
MOBILITY_WEIGHT = 0


def set_weights(weights=None):
    """Rebuild the per-square value tables.

    Folding every positional term into a lookup keyed by (colour, vertex, rank)
    turns evaluation into a sum over set bits. Because RANK is antisymmetric
    under the board's 180° automorphism and every vertex set used here maps onto
    its opposite, the resulting tables satisfy
    ``COB_VALUE[WHITE][i] == COB_VALUE[BLACK][ROTATE[i]]`` — which is what makes
    the evaluation provably colour-symmetric.
    """
    global COB_VALUE, ROK_VALUE, MOBILITY_WEIGHT, EVAL_WEIGHTS
    w = dict(EVAL_WEIGHTS if weights is None else weights)
    EVAL_WEIGHTS = w
    MOBILITY_WEIGHT = w['mobility']

    cob = ([], [])
    rk = ([], [])
    for colour in (WHITE, BLACK):
        for i in range(N_VERTICES):
            bit = 1 << i
            common = w['material']
            if i == INDEX['A1']:
                common += w['centre_a1']
            elif VERTICES[i][0] == 'B':
                common += w['centre_b']
            if HOME[colour] & bit:
                common += w['home_guard']

            advance = (MAX_RANK - RANK_OF[i]) if colour == WHITE else RANK_OF[i]
            cob_value = common + w['advancement'] * advance
            if DEAD[colour] & bit:
                cob_value += w['jammed_cob']

            cob[colour].append(cob_value)
            rk[colour].append(common + w['rok'])

    COB_VALUE = (tuple(cob[WHITE]), tuple(cob[BLACK]))
    ROK_VALUE = (tuple(rk[WHITE]), tuple(rk[BLACK]))


set_weights()


def mobility(occ, white, rok, colour):
    own = white if colour == WHITE else occ & ~white
    empty = FULL & ~occ
    free = own & (rok | HOME[colour])
    forward_table = FWD[colour]
    total = 0
    for i in bit_list(free):
        total += (ADJ[i] & empty).bit_count()
    for i in bit_list(own & ~free):
        total += (forward_table[i] & empty).bit_count()
    return total


def evaluate(occ, white, rok):
    """Static evaluation in centipieces — positive favours WHITE."""
    black = occ & ~white
    white_cob = COB_VALUE[WHITE]
    white_rok = ROK_VALUE[WHITE]
    black_cob = COB_VALUE[BLACK]
    black_rok = ROK_VALUE[BLACK]

    score = 0
    for i in bit_list(white & ~rok):
        score += white_cob[i]
    for i in bit_list(white & rok):
        score += white_rok[i]
    for i in bit_list(black & ~rok):
        score -= black_cob[i]
    for i in bit_list(black & rok):
        score -= black_rok[i]

    if MOBILITY_WEIGHT:
        score += MOBILITY_WEIGHT * (mobility(occ, white, rok, WHITE)
                                    - mobility(occ, white, rok, BLACK))
    return score


# -- Move ordering ---------------------------------------------------------

def order_score(occ, white, rok, stm, move, tt_move):
    """Static ordering heuristic — never applies the move."""
    if move == tt_move:
        return 1_000_000
    src = move >> 5
    dst = move & 31
    if src == dst:
        return 5_000

    enemy = (occ & ~white) if stm == WHITE else white
    captures = (ADJ[dst] & ~ADJ[src] & enemy & ~(1 << src)).bit_count()
    score = captures * 1_000

    if not ((rok >> src) & 1) and (HOME[stm ^ 1] & (1 << dst)):
        score += 400
    if stm == WHITE:
        score += (RANK_OF[src] - RANK_OF[dst]) * 5
    else:
        score += (RANK_OF[dst] - RANK_OF[src]) * 5
    return score


# -- Conversion to and from the dict representation ------------------------

def from_state(state):
    """dict game-state -> (occ, white, rok, stm)."""
    occ = white = rok = 0
    for vertex, checker in state['checkers'].items():
        bit = 1 << INDEX[vertex]
        occ |= bit
        if checker['color'] == 'WHITE':
            white |= bit
        if checker['isUpgraded']:
            rok |= bit
    return occ, white, rok, (WHITE if state['currentTurn'] == 'WHITE' else BLACK)


def to_state(occ, white, rok, stm):
    """(occ, white, rok, stm) -> dict game-state."""
    checkers = {}
    for i in bit_list(occ):
        checkers[VERTEX[i]] = {
            'color': 'WHITE' if (white >> i) & 1 else 'BLACK',
            'isUpgraded': bool((rok >> i) & 1),
        }
    return {'checkers': checkers, 'currentTurn': _COLOR_NAME[stm]}


def move_to_vertices(move):
    return (VERTEX[move >> 5], VERTEX[move & 31])


def move_from_vertices(from_v, to_v):
    return (INDEX[from_v] << 5) | INDEX[to_v]
