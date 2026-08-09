# Board control

Every player new to Tarati reaches for the centre. The hub touches all six
inner points, more than any other square, so it looks like the place to be. It
is the single most expensive mistake in the game.

## The centre is a trap

Measured across roughly ninety thousand positions, holding the hub is worth
about **three-quarters of a piece against you**. Not a small edge, not a wash:
a liability the size of most captures. The inner hexagon around it is nearly as
bad. The one part of the board that looks strong is the part you should least
want to occupy.

This is not a quirk of one engine's taste. It falls straight out of the
striking rule. A piece is captured when an enemy arrives next to it from a point
it did not already command, and the more lines meet at a square, the more
directions that arrival can come from. The hub, with six neighbours, can be
attacked from all of them. A home point, with two, almost never can.

Count it directly in real games and the pattern is stark:

| Point type | Connections | Struck, per visit |
|------------|:-----------:|:-----------------:|
| Home points (D) | 2 | 1.0% |
| Outer ring (C) | 3–4 | ~3% |
| Inner hexagon (B) | 5 | 5.0% |
| The hub (A1) | 6 | 5.2% |

A piece on the hub is struck **five times as often** as one tucked on a home
point. Put a piece in the centre and you have placed it where the enemy has the
most ways to reach it.

![A white piece sits on the hub. Black arrives at B4 from a distant point and strikes it.](fig:2646433,524705,0,1|arrow=C8-B4|mark=A1)

![The hub piece has flipped to black. The centre gave White nothing and cost a piece.](fig:2630065,524672,0,0|mark=A1)

The lesson is not "never touch the centre". A rok can pass through it to reach
the far side, and a fleeting visit that sets up a capture can be worth the risk.
The lesson is that the centre is a road, not a home. Park a piece there and it
is a target.

## What is worth having instead

If not the centre, then what? The same measurement that condemns the hub ranks
every other feature of a position, and one of them stands out.

**Mobility.** The number of legal moves you have, over and above your
opponent's, is worth about ten times what a casual eye would guess. Room to move
is close to the most valuable thing a position can give you, behind only
material itself. This follows the same logic as the centre in reverse: a player
with many moves can choose the arrival that captures, while a player pinned to a
few is forced into moves that expose pieces. In Tarati you win by keeping your
options open and closing down your opponent's.

**Material.** A piece is worth a piece, and a rok is worth
about a piece and a half, which matches intuition. What does not match intuition
is how much the positional factors move around that baseline. A one-piece
material lead is real, but a player who has buried a piece in the centre and
cramped their own movement can be behind while nominally ahead on the count.

Put the two ideas together and Tarati's version of good play comes into focus.
Keep your pieces where they cannot be easily reached, on the outer ring and near
home. Keep them mobile. Push into the centre only to arrive somewhere, never to
stay. Make your opponent be the one with a piece stuck on the hub and nowhere
to go.

## Setting up a strike

Mobility is not just safety, it is the raw material of attack. Because you can
only capture a piece by arriving from a line you did not already command, a
strike usually has to be arranged a move in advance: you cannot take what you are
already touching, so you step away and come back by another road. A rok, free to
move in any direction, is the piece that can do this.

![A black rok slides from C2 to C1, threatening nothing yet. After White replies, the rok swings to C12 and strikes the white piece on B6, which it could not have reached a move earlier.](seq:2099574,2097266,2097408,1|arrow=C2-C1|sub=rok slides to C1;;2099446,2097266,2097280,0|arrow=B4-C7|sub=White replies;;2107622,2105442,2105472,1|arrow=C1-C12|mark=B6|sub=and strikes B6)

The first move looks idle. The rok slides one square along the ring and captures
nothing. What it has done is reposition to a point from which the target is now
two steps away rather than one, so that the follow-up arrives from distance and
the pre-adjacency rule permits the capture. The move that does the damage is the
second one; the first is what made it legal.

This is the shape of most attacks in Tarati. The threatening move is rarely the
one that looks aggressive. It is the quiet repositioning a move earlier that
turns a piece you cannot yet take into one you can. When you want a capture, do
not ask which of your pieces is next to the target. Ask which of them can get
next to it from somewhere new.
