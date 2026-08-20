"""Board diagrams for the guide.

Produces standalone SVG for the Markdown chapters, the published artifact and
the print booklet. The React page uses `src/components/MiniBoard.js` instead,
and this deliberately mirrors its geometry — the same `getPosition` formula and
the same viewBox — so a diagram looks identical wherever it is rendered.

Two constraints shape the drawing:

* **The booklet may be printed in one colour.** Pieces are therefore
  distinguished by fill *and* by outline, and roks by an inner ring, so nothing
  depends on hue. Highlights use a dashed halo rather than a colour wash.
* **Diagrams must be reproducible.** Every figure is generated from a position
  in the corpus or the book, identified by its four board words, so any claim
  in the guide can be traced back to the position that produced it.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import bitboard as bb
from engine.board import EDGES, VERTICES

# Matches MiniBoard.js exactly.
BOARD_SIZE = 500
PADDING = 20
ASPECT = 1.2
V_WIDTH = (BOARD_SIZE - 2 * PADDING) / 6
VB_W = BOARD_SIZE / ASPECT
VB_H = BOARD_SIZE

# Circumradius of a regular dodecagon of side 1, and how far out the domestic
# points sit — one pathway beyond C1's height. Together these make all 42
# pathways exactly V_WIDTH long, which is what the patent describes. The old
# formula added the *angle* expression to the *radius* and placed D at exactly
# 3 * V_WIDTH, leaving the D-C lines 13% long; helpers/position.js carried the
# identical bug and carries the identical fix.
CIRCUMFERENCE_RADIUS = 1 / (2 * math.sin(math.pi / 12))
DOMESTIC_OFFSET = CIRCUMFERENCE_RADIUS * math.sin(5 * math.pi / 12) + 1

PIECE_R = V_WIDTH / 5
DOT_R = V_WIDTH / 14

INK = '#1a1a1a'
LINE = '#9aa0a6'
WHITE_FILL = '#fbfbf9'
BLACK_FILL = '#2b2b2b'
ACCENT = '#c0392b'
ACCENT_ALT = '#1d6fb8'


def position(vertex):
    """Vertex centre in viewBox coordinates — the port of helpers/position.js."""
    cx, cy = VB_W / 2, VB_H / 2
    if vertex == 'A1':
        return cx, cy

    kind, index = vertex[0], int(vertex[1:])
    if kind == 'B':
        angle = (index - 1) * (math.pi / 3) + math.pi / 2
        return cx + V_WIDTH * math.cos(angle), cy + V_WIDTH * math.sin(angle)
    if kind == 'C':
        angle = (index - 1) * (math.pi / 6) - math.pi / 12 + math.pi / 2
        radius = V_WIDTH * CIRCUMFERENCE_RADIUS
        return cx + radius * math.cos(angle), cy + radius * math.sin(angle)
    if kind == 'D':
        down = -1 if index > 2 else 1
        left = 1 if index in (1, 4) else -1
        return cx + V_WIDTH / 2 * left, cy + V_WIDTH * DOMESTIC_OFFSET * down
    return cx, cy


def _piece(vertex, colour, is_rok):
    x, y = position(vertex)
    fill = WHITE_FILL if colour == 'WHITE' else BLACK_FILL
    parts = ['<circle cx="%.2f" cy="%.2f" r="%.2f" fill="%s" stroke="%s" '
             'stroke-width="2"/>' % (x, y, PIECE_R, fill, INK)]
    if is_rok:
        # An inner ring, not a colour change: the booklet may print in mono.
        ring = WHITE_FILL if colour == 'BLACK' else INK
        parts.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="none" '
                     'stroke="%s" stroke-width="2"/>'
                     % (x, y, PIECE_R * 0.45, ring))
    return ''.join(parts)


def _arrow(from_v, to_v, colour=ACCENT, marker='arrowhead'):
    x1, y1 = position(from_v)
    x2, y2 = position(to_v)
    # Stop short of the destination so the head does not sit under a piece.
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy) or 1
    trim = PIECE_R + 5
    x1 += dx / length * trim
    y1 += dy / length * trim
    x2 -= dx / length * trim
    y2 -= dy / length * trim
    return ('<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="%s" '
            'stroke-width="3.5" marker-end="url(#%s)"/>'
            % (x1, y1, x2, y2, colour, marker))


def render(occ, white, rok, stm, highlights=(), arrows=(), alt_arrows=(),
           labels=False, title=None):
    """Return standalone SVG for one position.

    highlights  vertex names to ring with a dashed halo
    arrows      [(from, to), ...] drawn in the accent colour
    alt_arrows  a second set, drawn differently — for "instead of this, that"
    labels      draw vertex names, for the notation chapter
    """
    # Margin on all sides: D3/D4 sit at the very top of the coordinate space,
    # so vertex labels drawn above them fall outside a tight viewBox.
    margin = 22
    out = ['<svg xmlns="http://www.w3.org/2000/svg" '
           'viewBox="%.2f %.2f %.2f %.2f" width="%.0f" height="%.0f" role="img">'
           % (-margin, -margin, VB_W + 2 * margin, VB_H + 2 * margin,
              (VB_W + 2 * margin) * 0.62, (VB_H + 2 * margin) * 0.62)]
    if title:
        out.append('<title>%s</title>' % title)
    out.append(
        '<defs>'
        '<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" '
        'refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="%s"/></marker>'
        '<marker id="arrowhead-alt" markerWidth="8" markerHeight="6" refX="7" '
        'refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="%s"/></marker>'
        '</defs>' % (ACCENT, ACCENT_ALT))

    for a, b in EDGES:
        x1, y1 = position(a)
        x2, y2 = position(b)
        out.append('<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="%s" '
                   'stroke-width="1.5"/>' % (x1, y1, x2, y2, LINE))

    for vertex in VERTICES:
        x, y = position(vertex)
        out.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="%s"/>'
                   % (x, y, DOT_R, LINE))

    for vertex in highlights:
        x, y = position(vertex)
        out.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="none" '
                   'stroke="%s" stroke-width="2.5" stroke-dasharray="4 3"/>'
                   % (x, y, PIECE_R * 1.5, ACCENT))

    for i in bb.bit_list(occ):
        vertex = bb.VERTEX[i]
        colour = 'WHITE' if (white >> i) & 1 else 'BLACK'
        out.append(_piece(vertex, colour, bool((rok >> i) & 1)))

    for from_v, to_v in arrows:
        out.append(_arrow(from_v, to_v))
    for from_v, to_v in alt_arrows:
        out.append(_arrow(from_v, to_v, ACCENT_ALT, 'arrowhead-alt'))

    if labels:
        for vertex in VERTICES:
            x, y = position(vertex)
            out.append('<text x="%.2f" y="%.2f" font-size="11" fill="%s" '
                       'text-anchor="middle" font-family="ui-monospace,monospace">'
                       '%s</text>' % (x, y - PIECE_R - 5, INK, vertex))

    out.append('</svg>')
    return ''.join(out)


def render_state(state, **kwargs):
    """Convenience: render from a dict game-state."""
    return render(*bb.from_state(state), **kwargs)


def render_sequence(boards, sub_captions=None):
    """Render a row of boards as one SVG — an opening or attack unfolding.

    `boards` is a list of dicts, each with keys `occ, white, rok, stm` and the
    optional `arrows`, `highlights`, `labels` that `render` accepts. Between
    boards a small arrow glyph reads left to right, so three boards in a row
    show a line of play the way a diagram in a chess book does.

    A wide viewBox is used so the whole strip scales as one figure, which keeps
    the three boards the same size in print and never lets one break to a new
    line mid-sequence.
    """
    n = len(boards)
    sub_captions = sub_captions or [None] * n
    top_pad = 14                # keep the top row of pieces off the edge
    unit_w = VB_W + 44          # per-board slot, room for the connector arrow
    total_w = unit_w * n
    total_h = top_pad + VB_H + 46   # top pad + board + sub-caption strip

    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" '
           'width="%.0f" height="%.0f" role="img">'
           % (total_w, total_h, total_w * 0.6, total_h * 0.6)]
    out.append(
        '<defs>'
        '<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" '
        'refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="%s"/></marker>'
        '<marker id="arrowhead-alt" markerWidth="8" markerHeight="6" refX="7" '
        'refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="%s"/></marker>'
        '<marker id="seqhead" markerWidth="10" markerHeight="8" refX="8" '
        'refY="4" orient="auto"><polygon points="0 0, 10 4, 0 8" fill="%s"/></marker>'
        '</defs>' % (ACCENT, ACCENT_ALT, LINE))

    for i, board in enumerate(boards):
        x = i * unit_w + 22
        # Inline the single-board SVG's inner content, translated into place.
        inner = render(board['occ'], board['white'], board['rok'], board['stm'],
                       highlights=board.get('highlights', ()),
                       arrows=board.get('arrows', ()),
                       alt_arrows=board.get('alt_arrows', ()),
                       labels=board.get('labels', False))
        # Strip the outer <svg ...>...</svg> and its <defs> (shared above).
        body = inner[inner.index('>') + 1:inner.rindex('</svg>')]
        if '</defs>' in body:
            body = body[body.index('</defs>') + len('</defs>'):]
        out.append('<g transform="translate(%.0f,%.0f)">%s</g>'
                   % (x, top_pad, body))

        if sub_captions[i]:
            out.append('<text x="%.0f" y="%.0f" font-size="15" fill="%s" '
                       'text-anchor="middle" font-family="Georgia,serif">%s</text>'
                       % (x + VB_W / 2, total_h - 8, INK, sub_captions[i]))

        if i < n - 1:
            cx = (i + 1) * unit_w - 4
            out.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" '
                       'stroke="%s" stroke-width="3" marker-end="url(#seqhead)"/>'
                       % (cx - 22, top_pad + VB_H / 2, cx + 6, top_pad + VB_H / 2, LINE))

    out.append('</svg>')
    return ''.join(out)


def write(path, svg):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as handle:
        handle.write(svg)
    return path
