# Cramp

You can lose a game of Tarati without ever being behind. You lose it by running
out of moves, and a player who has never lost that way does not yet believe how
often it happens.

This chapter is about the resource that runs out. It is also, honestly, a chapter
about a measurement that failed first, because the failure teaches the idea
better than the success does.

## The measurement that failed

Cobs move one way. A white cob works its way toward Black's edge and can never
turn around. So each side starts the game owning a fixed number of forward steps
(thirty-eight, if you count them) and spends one every time a cob moves. It
looked like the cleanest idea in the book: count each side's remaining steps,
call the difference the **road**, and see who wins.

It works beautifully. The side with twelve more steps of road scores 87%. The side
with twelve fewer scores 14%. A textbook curve, across twenty-three thousand
positions.

It is also almost entirely wrong, and here is why. A side with five pieces has
more cobs than a side with three, and more cobs means more road. Road was
measuring the piece count wearing a disguise. Hold the material level, comparing
only positions where both sides have exactly four pieces, and the curve
collapses to a flat line: 50.7%, 48.6%, 50.9%, 49.9%, 44.9% across the whole
range. Nothing.

**Total road is not a thing.** If you take one habit from this chapter, take this
one: before you believe a positional rule, check it between players who are level
on material. Most rules that sound wise are the piece count in a hat.

## What is actually true

The idea was not wrong, it was too smooth. Road does not matter as a pool you
draw down. It matters at the moment a particular cob has nowhere left to go.

A cob outside its own home base can only move forward. Fill every forward square
in front of it and it is **stuck**. Not slow, not awkward, but out of the game
until the board opens or it promotes. Count those, and hold material level:

| Stuck cobs, you minus them | Your score |
|:--------------------------:|:----------:|
| −1 (they have one more) | 60.7% |
| 0 | 49.6% |
| +1 | 42.2% |
| +2 | **20.3%** |

Each stuck cob is worth roughly ten points of result. Two of them and you are
losing four games in five, at dead level material. That is a bigger swing than
most single strikes, and there is nothing on the board to show for it: you count
four pieces, they count four pieces, and you are lost.

The move count says the same thing from the other side. At equal material, three
extra legal moves is worth about nine points, and the far ends of the range run
from 34.5% to 70.9%.

| Legal moves, you minus them | Your score |
|:---------------------------:|:----------:|
| −6 or worse | 34.5% |
| −3 | 43.6% |
| level | 53.0% |
| +3 | 59.4% |
| +6 or better | 70.9% |

The board-control chapter already told you mobility was valuable, from a
regression across ninety thousand positions. This is the same claim tested a
harder way, with material held level so it cannot be the piece count in disguise,
and it survives.

## Playing it

**Count their stuck cobs, then count yours.** It takes seconds and it is the most
informative number on the board that is not the piece count. A cob with a friend
directly in front of it and nowhere to step is a piece you own on paper and do
not have.

**Your own pieces cause most of your cramp.** The forward squares in front of your
cobs are usually blocked by *your other cobs*, not by the enemy. Advancing two
cobs up the same file is the commonest self-inflicted wound in the game. Spread
the front.

**Attack the front cob, not the back one.** If you want to jam an opponent, the
piece to block is the one furthest advanced, because everything behind it queues
up. One well-placed piece in front of a leading cob can freeze two or three.

**A rok is never stuck.** Roks move in any direction, so they neither run out of
road nor block themselves. This is the real reason the endgame chapter says a rok
wins endgames. It is not that a rok is worth more material, it is that it is the
only piece
immune to the thing that actually decides level endings.

## Cramp and doors are the same trade

Put this chapter next to the one on doors and the tension is exact.

A piece with no empty neighbours cannot be struck. A piece with no empty forward
squares cannot move. Those are the same empty squares. Safety and mobility are
drawn from one account, and every move you make spends from it in one direction
or the other.

That is Tarati's central bargain, and knowing it is most of what separates a
strong player from an average one. The average player asks whether a move is
safe. The strong player asks what it costs to be safe there, and whether the
position can afford it.
