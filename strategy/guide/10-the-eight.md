# The eight

Everything from here on assumes you already play a reasonable game: you know how
the pieces move, you can see a strike coming, and you have stopped parking pieces
on the hub. What follows is the next layer, and it starts with a fact about the
game that almost nobody notices in their first hundred games.

## Nobody is ever captured

Count the pieces at the end of any Tarati game. There are eight. Count them at
move forty. Eight. At move two hundred, if the game lasts that long, still eight.

A strike does not remove a piece from the board. It turns it around. The piece
that was yours a moment ago is standing on exactly the same point, and it is now
your opponent's. Replaying three hundred complete games move by move, the board
held eight pieces in all 11,582 positions that occurred, without exception.

This is not a curiosity. It changes the arithmetic of the whole game.

## A strike is worth two pieces, not one

In a game where captures remove pieces, taking one puts you one ahead. In Tarati,
taking one puts you **two** ahead, because the same act that adds a piece to your
side subtracts one from theirs. Five against three is not "one up". It is a
two-piece gap on an eight-piece board, a quarter of everything there is.

You can see this in what deep analysis pays for material. The guide's evaluation
was hand-set at 100 points per piece. Fitted against what a twelve-ply search
actually thinks positions are worth, across 92,769 of them, the true figure comes
out at **136**. The hand-set number was measuring the piece. The fitted number is
measuring the swing.

So the first correction to a club player's instincts is this: **every strike is
worth roughly twice what it looks like.** A line that wins a piece at the cost of
letting one go is not level. It is a wash only if both strikes land; if yours
lands and theirs does not, you have moved the position by a quarter of the board.

## Some strikes take two

The strike rule fires on *every* enemy adjacent to the square you arrive on that
you were not already beside. Usually that is one piece. Sometimes it is more.

Across 66,038 strikes in the corpus:

| Pieces flipped | Share | Swing |
|:---:|:---:|:---:|
| one | 82.7% | 2 |
| two | 16.8% | 4 |
| three | 0.5% | 6 |

A double strike moves four pieces, **half the board**, in a single move. It is
not a rare flourish either: one strike in six is a double. If you are only ever
looking for the single, you are missing the move that decides games.

![White to move, three pieces against five, and apparently losing. B1 is empty, and standing on it would put White newly beside both A1 and B2. C2-B1 takes them both: five against three the other way, in one move.](fig:541493,525056,0,0|arrow=C2-B1|mark=A1,B2)

The way to find doubles is to stop looking at enemy pieces one at a time and
start looking at *empty squares*. Ask of each empty point next to you: if I stood
there, how many enemies would I be newly beside? That question finds doubles.
Scanning targets one by one does not.

## What this means for how you count

Three habits follow, and they are the difference between counting like a beginner
and counting like a strong player.

**Count to eight, not from zero.** "I am a piece up" is a chess sentence. The
Tarati sentence is "five to three". The denominator is fixed, so a lead is always
a fraction of a known whole, and you always know exactly how far from the end you
are: eight to nothing is the win.

**Price a strike at two.** When you weigh a line that wins one and loses one,
remember both legs are doubled, so they still cancel. But a line that wins one
and loses nothing is worth twice what you would guess, and so is the reverse.
This is why a single careless move loses games in Tarati faster than in games
where captures merely subtract.

**Strikes are common, so tempo is cheap and safety is not.** Thirty-eight per cent
of all moves played in the corpus strike something, and twenty per cent of all
*legal* moves do. In a position with eight legal moves, you should expect one or
two of them to take a piece, for you and for your opponent on the reply. There
is no quiet phase in this game. There are only positions where you have not yet
found the strike.

The rest of these chapters are about the two questions that follow from that.
Which of my pieces can be taken, and how do I stop it? And when nothing can be
taken, what is the move?
