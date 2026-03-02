"""Vertex coordinate calculator — direct port of src/helpers/position.js.

Used by the AI's forward-direction check with fixed parameters:
    width=250 (w=500/2), height=500, v_width=250
"""

import math


def get_position(vertex_id, width=250, height=500, v_width=250):
    """Return (x, y) for a vertex using the same trig as the React app."""
    center_x = width / 2
    center_y = height / 2

    if vertex_id == 'A1':
        return (center_x, center_y)

    vtype = vertex_id[0]
    position = int(vertex_id[1:])

    if vtype == 'B':
        angle = (position - 1) * (math.pi / 3)
        return (
            center_x + v_width * math.cos(angle + math.pi / 2),
            center_y + v_width * math.sin(angle + math.pi / 2),
        )

    if vtype == 'C':
        angle = (position - 1) * (math.pi / 6) - math.pi / 12 + math.pi / 2
        radius = v_width * (1 + math.sqrt(11 / 13)) - math.pi / 12 + math.pi / 2
        return (
            center_x + radius * math.cos(angle),
            center_y + radius * math.sin(angle),
        )

    if vtype == 'D':
        down = -1 if position > 2 else 1
        left = 1 if position in (1, 4) else -1
        return (
            center_x + v_width / 2 / left,
            center_y + v_width * 3 * down,
        )

    return (center_x, center_y)


# Pre-computed Y values for every vertex (avoids repeated trig in is_valid_move)
POSITION_Y = {}

def _precompute():
    from .board import VERTICES
    for v in VERTICES:
        POSITION_Y[v] = get_position(v)[1]

# Called lazily the first time POSITION_Y is needed
def ensure_positions():
    if not POSITION_Y:
        _precompute()
