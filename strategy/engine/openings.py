"""Opening-tree enumeration.

Tarati's opening is small enough to enumerate rather than sample. With
transposition merging the effective branching factor is about 2.57:

    ply  4:        357 distinct positions
    ply  8:     31,913
    ply 10:    235,693
    ply 12:  1,546,911

so the whole opening can be walked exhaustively instead of being estimated from
game statistics. Only four moves are legal for WHITE on ply 1, which is why
randomising the first move alone — as the previous corpus did — produced just
four distinct openings.
"""

from .board import initial_game_state, ROTATION, OPPONENT
from .ai import get_all_possible_moves, apply_move_ai, terminal_loser


def mirror_state(state):
    """Rotate the board 180° and swap colours.

    The board has an exact automorphism mapping WHITE's half onto BLACK's, so
    a mirrored position is strategically identical with the colours exchanged.
    Playing every opening alongside its mirror is what makes an aggregate White
    score interpretable: a set of asymmetric openings can favour one colour
    regardless of engine strength, which would otherwise be misread as a
    first-player effect.
    """
    return {
        'checkers': {
            ROTATION[v]: {
                'color': OPPONENT[c['color']],
                'isUpgraded': c['isUpgraded'],
            }
            for v, c in state['checkers'].items()
        },
        'currentTurn': OPPONENT[state['currentTurn']],
    }


def position_key(state):
    """Canonical, hashable identity of a position (pieces + side to move)."""
    return (
        frozenset(
            (v, c['color'], c['isUpgraded']) for v, c in state['checkers'].items()
        ),
        state['currentTurn'],
    )


def expand(state):
    """Return [(move, child_state), ...] for every legal move."""
    return [
        (move, apply_move_ai(state, move[0], move[1]))
        for move in get_all_possible_moves(state)
    ]


def enumerate_frontier(ply, start=None, include_terminal=False):
    """Return the distinct positions reachable in exactly `ply` half-moves.

    Positions where the game has already ended are dropped unless
    `include_terminal` is set, so callers get playable start positions.
    """
    start = start if start is not None else initial_game_state()
    frontier = {position_key(start): start}

    for _ in range(ply):
        nxt = {}
        for state in frontier.values():
            if terminal_loser(state) is not None:
                continue
            for _move, child in expand(state):
                nxt.setdefault(position_key(child), child)
        frontier = nxt

    if not include_terminal:
        return [s for s in frontier.values() if terminal_loser(s) is None]
    return list(frontier.values())


def frontier_bitboards(ply, limit=None):
    """Distinct positions at exactly `ply`, as (occ, white, rok, stm) tuples.

    Enumerating in bitboard form rather than building dict game-states matters
    at depth: ply 10 has 235,693 positions, and materialising those as
    dicts-of-dicts is both slow and memory-hungry. Callers that only need start
    positions should use this.
    """
    from . import bitboard as bb

    frontier = {bb.INITIAL: None}
    for _ in range(ply):
        nxt = {}
        for occ, white, rok, stm in frontier:
            if bb.terminal_loser(occ, white, rok, stm) is not None:
                continue
            for move in bb.gen_moves(occ, white, rok, stm):
                nxt[bb.make_move(occ, white, rok, stm, move)] = None
        frontier = nxt

    out = [p for p in frontier if bb.terminal_loser(*p) is None]
    out.sort()
    if limit is not None and len(out) > limit:
        step = len(out) / limit
        out = [out[int(i * step)] for i in range(limit)]
    return out


def _sort_key(state):
    return (
        sorted((v, c['color'], c['isUpgraded']) for v, c in state['checkers'].items()),
        state['currentTurn'],
    )


def frontier_sample(ply, count, rng, mirror_balanced=False):
    """A deterministic, evenly-spread sample of the ply-N frontier.

    Takes every k-th position from the sorted frontier rather than a random
    draw, so the sample spans the whole tree instead of clustering.

    With ``mirror_balanced``, each selected position is followed by its 180°
    mirror, so the set as a whole is colour-neutral and an aggregate White
    score means what it appears to mean.
    """
    positions = enumerate_frontier(ply)
    positions.sort(key=_sort_key)

    if not mirror_balanced:
        if count >= len(positions):
            return positions
        step = len(positions) / count
        return [positions[int(i * step)] for i in range(count)]

    half = max(1, count // 2)
    step = len(positions) / half if half < len(positions) else 1
    picked = [positions[int(i * step)] for i in range(min(half, len(positions)))]

    out = []
    for state in picked:
        out.append(state)
        out.append(mirror_state(state))
    return out[:count] if count <= len(out) else out
