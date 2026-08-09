#!/usr/bin/env python3
"""12_verify_figures.py — check that every board in the guide says what its
caption says it says.

The guide's premise is that each diagram is a position that actually occurred
and each claim is traceable to it. That premise is only worth anything if it is
enforced, and it is easy to break: a caption written from a position's *label*
rather than from the position itself will describe a board that does not exist.
Three of the first four captions drafted for the advanced chapters were wrong
that way, which is why this exists.

Two modes:

    ./venv/bin/python 12_verify_figures.py --describe OCC,WHITE,ROK,STM
        Print everything true about one position: who stands where, how many
        doors each piece has, who is in contact with whom, what can be struck
        this move and next.

    ./venv/bin/python 12_verify_figures.py --scan
        Pull every `fig:`/`seq:` spec out of guide/*.md, re-derive the facts,
        and print them beside the caption so the two can be compared.

It deliberately does not try to parse English and grade the caption. It puts
the truth next to the sentence and makes the mismatch obvious.
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import bitboard as bb
from engine.search2 import threatened, strike_count

GUIDE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'guide')

#: `![caption](fig:occ,white,rok,stm|opt=...)` and the `seq:` multi-board form.
FIGURE_RE = re.compile(r'!\[(?P<caption>[^\]]*)\]\((?P<kind>fig|seq):(?P<spec>[^)]*)\)')


def parse_boards(kind, spec):
    """Return [(occ, white, rok, stm), ...] for a fig: or seq: spec."""
    chunks = spec.split(';;') if kind == 'seq' else [spec]
    boards = []
    for chunk in chunks:
        head = chunk.split('|')[0]
        parts = [p.strip() for p in head.split(',')]
        if len(parts) < 4:
            continue
        boards.append(tuple(int(p) for p in parts[:4]))
    return boards


def describe(occ, white, rok, stm):
    """Every fact about a position that a caption might get wrong."""
    empty = bb.FULL & ~occ
    mover = white if stm == bb.WHITE else occ & ~white
    lines = [f"{'WHITE' if stm == bb.WHITE else 'BLACK'} to move   "
             f"({occ},{white},{rok},{stm})   {occ.bit_count()} pieces, "
             f"{white.bit_count()} white / {(occ & ~white).bit_count()} black"]

    for i in sorted(bb.bit_list(occ), key=lambda i: bb.VERTEX[i]):
        colour = 'WHITE' if (white >> i) & 1 else 'BLACK'
        kind = 'rok' if (rok >> i) & 1 else 'cob'
        d = (bb.ADJ[i] & empty).bit_count()
        friends, foes = [], []
        for j in bb.bit_list(bb.ADJ[i] & occ):
            same = ((white >> j) & 1) == ((white >> i) & 1)
            (friends if same else foes).append(bb.VERTEX[j])
        lines.append(f"  {bb.VERTEX[i]:4} {colour:5} {kind}  doors={d}"
                     f"  touching enemy: {foes or '-'}"
                     f"  touching own: {friends or '-'}")

    now = threatened(occ, white, rok, stm)
    opp = threatened(occ, white, rok, stm ^ 1)
    lines.append(f"  mover can flip now:    "
                 f"{[bb.VERTEX[i] for i in bb.bit_list(now)] or '-'}")
    lines.append(f"  opponent could flip:   "
                 f"{[bb.VERTEX[i] for i in bb.bit_list(opp)] or '-'}")

    striking = []
    for m in bb.gen_moves(occ, white, rok, stm):
        n = strike_count(occ, white, rok, stm, m)
        if n:
            a, b = bb.move_to_vertices(m)
            striking.append(f"{a}-{b} (x{n})")
    lines.append(f"  moves that strike:     {striking or '-'}")

    # Stuck cobs, the quantity the cramp chapter counts.
    for colour, name in ((bb.WHITE, 'WHITE'), (bb.BLACK, 'BLACK')):
        own = white if colour == bb.WHITE else occ & ~white
        fwd = bb.FWD[colour]
        stuck = [bb.VERTEX[i] for i in bb.bit_list(own & ~rok & ~bb.HOME[colour])
                 if not (fwd[i] & empty)]
        lines.append(f"  {name} stuck cobs: {stuck or '-'}   "
                     f"legal moves: {bb.mobility(occ, white, rok, colour)}")
    return '\n'.join(lines)


def scan():
    problems = 0
    for name in sorted(os.listdir(GUIDE_DIR)):
        if not name.endswith('.md'):
            continue
        path = os.path.join(GUIDE_DIR, name)
        with open(path) as fh:
            text = fh.read()
        matches = list(FIGURE_RE.finditer(text))
        if not matches:
            continue
        print(f"\n{'=' * 72}\n{name}\n{'=' * 72}")
        for match in matches:
            caption = match.group('caption')
            boards = parse_boards(match.group('kind'), match.group('spec'))
            print(f"\ncaption: {caption}")
            if not boards:
                print("  !! could not parse a board out of this spec")
                problems += 1
                continue
            for index, board in enumerate(boards):
                # A finished game is legitimate as the last frame of a sequence
                # — that is how the endgame chapter shows a total conversion —
                # but never as the position a caption asks you to play from.
                if index == 0 and bb.terminal_loser(*board) is not None:
                    print(f"  !! board {index + 1} is already a finished game")
                    problems += 1
                prefix = f"  [{index + 1}] " if len(boards) > 1 else "  "
                print(prefix + describe(*board).replace('\n', '\n  '))
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--describe', help='occ,white,rok,stm')
    ap.add_argument('--scan', action='store_true')
    args = ap.parse_args()

    if args.describe:
        print(describe(*(int(x) for x in args.describe.split(','))))
        return 0
    if args.scan:
        problems = scan()
        print(f"\n{problems} structural problem(s); captions still need a human "
              f"read against the facts above.")
        return 0
    ap.print_help()
    return 1


if __name__ == '__main__':
    sys.exit(main())
