# Doors

The board-control chapter told you the centre is a trap and gave you the reason:
the hub has six neighbours, so it can be attacked from six directions. That is
true, and it is also the beginning of something much more useful. The same idea,
sharpened, becomes a number you can count at the board in about two seconds, and
it tells you which of your pieces is actually in danger.

## The only way in

A strike happens when an enemy **arrives** on a point next to your piece. Arrives.
Not sits, not aims, not threatens from a distance. Something has to physically
move onto an empty square beside you.

So count the empty squares beside your piece. Call them its **doors**. If a piece
has no empty neighbour, no enemy can arrive next to it, and the piece cannot be
struck at all. Not by a clever move, not by a rok, not by anything.

That is not a low probability. It is zero, and it is zero by the rule rather than
by luck. Across 144,378 pieces observed in real positions, the ones with no doors
were takeable **0 times out of 3,425**.

## The whole risk, in one number

Add the doors up and the danger scales almost linearly. Here is the chance that a
piece can be taken by the opponent's very next move, by how many doors it has:

| Doors | Chance it can be taken now | Positions |
|:-----:|:--------------------------:|:---------:|
| 0 | **0.0%** | 3,425 |
| 1 | 11.1% | 23,865 |
| 2 | 19.1% | 49,190 |
| 3 | 30.4% | 43,249 |
| 4 | 41.0% | 19,639 |
| 5 | 51.5% | 4,781 |
| 6 | 81.7% | 229 |

Every extra door costs you roughly ten percentage points of safety. A piece with
four doors is in danger four times out of ten, right now, on the very next move.
A piece with one door is nearly safe.

This is the number the "centre is a trap" rule was approximating. A piece on the
hub can be taken on the next move **37.3%** of the time; a piece on a home point,
**10.8%**. But degree alone gets it wrong in places. The four home-corner points
have four connections yet sit at 19%, safer than the three-connection points at
24%, because their neighbours are squares the enemy struggles to reach. Doors
count what actually matters: not how many lines meet at a square, but how many of
them are currently standing open.

![Both marked pieces are white cobs and both count for one on a material count. A1 has four doors and Black can take it on this move. C6 has none, and nothing on the board can touch it. Look again at C6 when you reach the end of this chapter.](fig:210955,6147,0,1|mark=A1,C6)

## Learning to see it

At the board, the count is fast. Look at a piece, count the empty points touching
it, and that digit is its risk. Two habits fall out.

**Before you move a piece, count the doors of the square you are moving to.**
Not the square it is leaving. Beginners evaluate a move by what it attacks;
strong players also evaluate it by what it exposes. Moving from a two-door square
to a four-door square is handing your opponent twenty points of probability for
free, and you will not feel it until the piece is gone.

**When you want to attack, count your opponent's doors and go where they are
widest.** A three-door enemy piece is one you have a real chance of reaching. A
one-door enemy piece usually is not worth planning around, and the move that
would take it is often better spent elsewhere.

## The catch, and it is a big one

A piece with no doors cannot be struck. A piece with no doors also cannot move.

That is the same sentence. The empty squares beside your piece are simultaneously
the routes an enemy uses to reach it and the routes it uses to go anywhere. Total
safety and total paralysis are the identical position, and in a game you lose by
having no legal move, walling yourself in is not a defence. It is a slow way of
losing.

Go back to the diagram. C6 cannot be struck by anything on the board, and C6
cannot move. It is not a fortress, it is a piece White no longer owns in any
sense that matters. White has two such cobs in that position and four legal moves
in total, against Black's five.

So doors are not something to minimise. They are something to **price**. A piece
with one door is cheap to keep and hard to use. A piece with four is useful and
expensive. Good play in the middlegame is mostly a matter of paying that price
where it buys you something and refusing to pay it where it does not. The
endgame chapter is about what happens when a whole side runs out of the ability
to pay it at all.
