"""Board topology and move application — direct port of src/GameBoard.js."""

import copy

# -- Vertices (23) --------------------------------------------------------

VERTICES = [
    'A1',
    'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
    'C7', 'C8', 'C9', 'C10', 'C11', 'C12',
    'D1', 'D2', 'D3', 'D4',
]

# -- Edges (42) -----------------------------------------------------------

EDGES = [
    # Home base White
    ('D1', 'D2'), ('D1', 'C1'), ('D2', 'C2'),
    # Home base Black
    ('D3', 'D4'), ('D3', 'C7'), ('D4', 'C8'),
    # C — Circumference
    ('C1', 'C2'), ('C2', 'C3'), ('C3', 'C4'),
    ('C4', 'C5'), ('C5', 'C6'), ('C6', 'C7'),
    ('C7', 'C8'), ('C8', 'C9'), ('C9', 'C10'),
    ('C10', 'C11'), ('C11', 'C12'), ('C12', 'C1'),
    # B — Boundary
    ('B1', 'B2'), ('B2', 'B3'), ('B3', 'B4'),
    ('B4', 'B5'), ('B5', 'B6'), ('B6', 'B1'),
    # C to B
    ('C1', 'B1'), ('C2', 'B1'),
    ('C3', 'B2'), ('C4', 'B2'),
    ('C5', 'B3'), ('C6', 'B3'),
    ('C7', 'B4'), ('C8', 'B4'),
    ('C9', 'B5'), ('C10', 'B5'),
    ('C11', 'B6'), ('C12', 'B6'),
    # B to A (absolute middle)
    ('B1', 'A1'), ('B2', 'A1'), ('B3', 'A1'),
    ('B4', 'A1'), ('B5', 'A1'), ('B6', 'A1'),
]

# -- Home bases -----------------------------------------------------------

HOME_BASES = {
    'WHITE': frozenset(['C1', 'C2', 'D1', 'D2']),
    'BLACK': frozenset(['C7', 'C8', 'D3', 'D4']),
}

# -- Pre-computed lookups -------------------------------------------------

# Adjacency list: vertex → list of neighbours
ADJACENCY = {v: [] for v in VERTICES}
for a, b in EDGES:
    ADJACENCY[a].append(b)
    ADJACENCY[b].append(a)

# Edge set for O(1) validity check
EDGE_SET = set()
for a, b in EDGES:
    EDGE_SET.add((a, b))
    EDGE_SET.add((b, a))

# -- Initial game state ---------------------------------------------------

def initial_game_state():
    """Return the starting board: 4 WHITE, 4 BLACK, WHITE to move."""
    return {
        'checkers': {
            'C1': {'color': 'WHITE', 'isUpgraded': False},
            'C2': {'color': 'WHITE', 'isUpgraded': False},
            'D1': {'color': 'WHITE', 'isUpgraded': False},
            'D2': {'color': 'WHITE', 'isUpgraded': False},
            'C7': {'color': 'BLACK', 'isUpgraded': False},
            'C8': {'color': 'BLACK', 'isUpgraded': False},
            'D3': {'color': 'BLACK', 'isUpgraded': False},
            'D4': {'color': 'BLACK', 'isUpgraded': False},
        },
        'currentTurn': 'WHITE',
    }

# -- Core move logic ------------------------------------------------------

def apply_move_to_board(state, from_v, to_v):
    """Apply a move and return (new_state, strikes, upgrades).

    new_state  — board after the move (currentTurn unchanged)
    strikes    — list of vertices whose pieces were flipped
    upgrades   — list of vertices whose pieces were upgraded (includes mover)
    """
    # Deep-copy checkers (each checker is a flat dict of primitives)
    new_checkers = {k: dict(v) for k, v in state['checkers'].items()}

    mover = new_checkers.pop(from_v)
    new_checkers[to_v] = mover

    upgrades = []

    # Mover upgrade: landing on the opponent's home base
    opp_color = 'BLACK' if mover['color'] == 'WHITE' else 'WHITE'
    if to_v in HOME_BASES[opp_color]:
        mover['isUpgraded'] = True
        upgrades.append(to_v)

    # Strike: flip every adjacent opponent piece to mover's colour
    strikes = []
    for adj in ADJACENCY[to_v]:
        if adj in new_checkers and new_checkers[adj]['color'] != mover['color']:
            strikes.append(adj)
            new_checkers[adj]['color'] = mover['color']
            # Struck piece upgrade: now on its new team's opponent home base
            struck_opp = 'BLACK' if new_checkers[adj]['color'] == 'WHITE' else 'WHITE'
            if adj in HOME_BASES[struck_opp]:
                new_checkers[adj]['isUpgraded'] = True
                upgrades.append(adj)

    new_state = {'checkers': new_checkers, 'currentTurn': state['currentTurn']}
    return new_state, strikes, upgrades
