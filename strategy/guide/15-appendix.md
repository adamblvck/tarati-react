# Appendix

## Opening reference

The two opening ideas and the four common ways the first two moves go, with the
practical result from matched-strength games. At perfect play all are equal; the
percentages are how they score in real play.

| Line | Idea | White | Black | Draw | Character |
|------|------|:-----:|:-----:|:----:|-----------|
| C1-B1 / C7-C6 | Inward vs ring | **51%** | 38% | 11% | White's best practical opening |
| C1-C12 / C7-C6 | Ring vs ring | 45% | 42% | 13% | Quiet, solid, most drawish |
| C1-C12 / C7-B4 | Ring vs inward | 36% | **54%** | 10% | Black's counter-thrust; respect it as White |
| C1-B1 / C7-B4 | Inward vs inward | 46% | 47% | 8% | The fighting line, fewest draws |

The rule of thumb behind the table: the inward thrust toward the hub is the
aggressive choice for whoever plays it, but only pays if the piece is used to
attack rather than left sitting in the exposed centre.

## The value of things

What a depth-12 search pays for each feature of a position, in
centipieces, where one hundred is a full piece. These are the numbers behind the
board-control chapter, and several of them run against intuition.

| Feature | Worth (centipieces) | Note |
|---------|:-------------------:|------|
| A piece | +100 | the unit |
| A rok over a cob | +55 | freedom is worth about half a piece |
| A move of mobility | +31 | far more than it looks |
| Occupying the hub (A1) | **−74** | a liability, not an asset |
| Occupying the inner ring (B) | **−37** | the whole centre is exposed |
| A dead cob | −36 | worse than useless while still counted |

## The advanced numbers, on one page

Everything from the second half of the guide, in the form you would want at a
board. All of it is measured over positions from real games; the door table is
144,378 pieces, the cramp tables hold material level, and the depth table is a
sample of ninety positions per category.

**Risk.** Chance a piece can be taken by the opponent's very next move, by how
many *empty* squares touch it.

| Doors | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Takeable now | 0% | 11% | 19% | 30% | 41% | 52% | 82% |

**Cramp**, at equal material. A stuck cob is one outside its own home base with
no empty square in front of it.

| Stuck cobs, you minus them | −1 | 0 | +1 | +2 |
|---|:-:|:-:|:-:|:-:|
| Your score | 61% | 50% | 42% | 20% |

| Legal moves, you minus them | −6 | −3 | 0 | +3 | +6 |
|---|:-:|:-:|:-:|:-:|:-:|
| Your score | 35% | 44% | 53% | 59% | 71% |

**Strikes.** One strike is a two-piece swing, because the board always holds
eight and a struck piece changes sides rather than leaving.

| Pieces flipped | one | two | three |
|---|:-:|:-:|:-:|
| Share of strikes | 82.7% | 16.8% | 0.5% |
| Swing | 2 | 4 | 6 |

Twenty per cent of all legal moves strike something; thirty-eight per cent of
moves actually played do.

**What wins, and how hard it is to see.** In positions where one move beats the
rest by more than a piece, 26.2% of the winners take nothing at all.

| Kind of winning move | Share of the quiet ones | Found within 2 ply |
|---|:-:|:-:|
| Builds a threat | 39% | 42% |
| Shuts a door | 22% | 46% |
| Escapes | 15% | 68% |
| Promotes | 12% | 76% |
| *(a strike, for comparison)* | n/a | 91% |

**Two rules that hold without exception**, checked against every strike and
every legal move in the corpus:

- A piece with no empty neighbour cannot be struck. *(0 exceptions in 3,425)*
- No piece can strike an enemy it was already touching, and no move creates new
  contact without striking. *(0 exceptions in 39,107 strikes and 10,450
  contacts)*

## The difficulty ladder

The game's four difficulty settings are not labels for search depth. They were
measured by a round robin of forty-eight thousand games and rated by Elo, so the
gaps between them are real, tested differences in strength.

| Setting | Approx. Elo | Best-move rate |
|---------|:-----------:|:--------------:|
| Easy | 0 | 45% |
| Medium | 450 | 57% |
| Hard | 740 | 68% |
| Champion | 1090 | 86% |

The "best-move rate" is how often each level plays the move a deep search
prefers, measured over a hundred thousand real positions. It is a second,
independent confirmation that the ladder is genuine: accuracy rises with rating,
computed a completely different way from the game results.

## How this guide was made

Nothing here is opinion, and it is worth being precise about what that means and
where it stops.

The rules were implemented from the patent and checked against a suite of tests.
An engine was built on top of them and verified two ways: its evaluation is
provably symmetric between the two colours, and its search agrees move for move
with a separate implementation across hundreds of positions.

The openings come from an exhaustive solve. Every distinct position reachable in
the first ten moves, all three hundred and seventy thousand of them, was
enumerated and evaluated, so opening claims are proofs about the position rather
than statistics from games.

The strategic claims come from a corpus of more than a million games and a pass
in which an engine scored every legal move in over a hundred thousand positions
drawn from them. That is what lets the guide say what a move costs rather than
only how often games containing it were won. Every board shown is drawn
from a real game.

One honest limit, and one correction.

The limit: "best move" means best against a strong reference, not against perfect
play. Every move in this guide was scored twice, by two engines a measured two
hundred Elo apart, and the second pass changed the chosen move in a fifth of
positions. The advanced chapters lean where they can on things that are true of
the position rather than things an engine prefers, since a piece with no empty
neighbour cannot be struck whatever any engine thinks, but the move-quality
numbers still carry that ceiling.

On depth, though, the guide is on firm ground. Searching deeper than twelve plies
changes almost nothing here: on a controlled test the depth-12 verdict matched a
depth-16 verdict on 94% of chosen moves and on 99% of the strike-versus-quiet
classifications this guide actually uses, for an eighth of the work. A median
Tarati game is only twenty-nine plies long, so twelve is already most of the way
to the end. Depth was never the limit. Playing exchanges out before judging a
position was.

The correction: earlier drafts of this guide reported a tempo effect worth
roughly two pieces, on the evidence that the engine scored whichever side had to
move about 230 centipieces worse from the symmetric opening. That was an
artefact. The engine had no quiescence search, so it was stopping its analysis in
the middle of exchanges, and the resulting error alternated in sign with every
extra ply of depth, which is the signature of the mistake rather than of a
property of the game. Re-run with a search that plays out the strikes before it evaluates,
the same position scores zero at every depth from six to fourteen. **The opening
is balanced and there is no large tempo effect.**

What survives is the practice that the mistaken finding produced: this guide
judges moves by what they cost relative to the best move at the same position,
never by an engine's absolute score. That was the right method for the wrong
reason, and it is still the right method.

## A note on measuring

Two of the findings in these chapters started life as something else, and both
failures are more instructive than the results that replaced them.

The "centre is a trap" rule was originally a claim about how many lines meet at a
square. That is nearly right, and wrong in a specific place: the four home-corner
points have four connections but are safer than the three-connection points,
because their neighbours are squares an opponent struggles to reach. Counting
*open* neighbours instead of all of them fixes it, and gives a number you can
compute at the board.

The cramp chapter was going to be about road, the total forward steps each side
has left. It produces a beautiful curve, from 14% to 87%, and it is almost
entirely the piece count in disguise: a side with more pieces has more cobs and
therefore more road. Held at equal material the curve is flat. Every positional
claim in this guide is now checked that way, and the ones that did not survive
are not in it.
