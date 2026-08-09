# Where games are lost

The fastest way to improve is to know where you are bleeding. Because the engine
scored every move in more than a hundred thousand real positions, we can watch
exactly where players of each strength go wrong, and the picture is clear enough
to turn into advice.

Two numbers describe a player. How often they find the best move, and how often
they throw away more than a full piece in a single move. Here is how both change
with strength, broken down by phase of the game.

## The blunder map

Share of moves that give away more than a piece:

| Level | Opening | Middlegame | Endgame |
|-------|:-------:|:----------:|:-------:|
| Beginner | 24.9% | 17.4% | 20.3% |
| Intermediate | 19.7% | 11.0% | 16.3% |
| Strong | 12.4% | 7.0% | 10.0% |
| Expert | 2.1% | 1.6% | 3.7% |

Read down the columns and two facts jump out.

**Beginners lose in the opening.** A quarter of a beginner's opening moves throw
away a piece, far more than in any other phase. This is the trap the openings
chapter warned about made visible: the first few moves feel safe, so a weak
player relaxes, and then the position sharpens and punishes the habit. If you are
starting out, the single highest-value thing you can do is slow down at move
five. The moves that feel free are the ones costing you games.

**Everyone loses in the endgame.** Look at the endgame column. At every level it
sits above the middlegame, and for the strongest players it is the worst phase
outright: an expert throws a piece in the endgame nearly twice as often as in the
opening. Conversion and jamming are hard to calculate. Whose cob strands first,
whether a rok arrives in time, whether a strike cascades or fizzles, these are
concrete questions that reward depth of calculation, and they are the last thing
a strong player masters.

That column is also the one that moved most when this guide's analysis engine was
rebuilt to play out exchanges before judging a position. The old engine stopped
mid-exchange and quietly forgave endgame errors it could not see; every endgame
figure above rose when it was fixed. If anything, the endgame is harder than the
earlier draft of this chapter said.

## Everyone is sharpest in the middle

The other pattern is that the middlegame is where every level plays best. Share
of moves that match the engine's first choice:

| Level | Opening | Middlegame | Endgame |
|-------|:-------:|:----------:|:-------:|
| Beginner | 43% | 52% | 41% |
| Intermediate | 54% | 65% | 54% |
| Strong | 65% | 74% | 65% |
| Expert | 85% | 90% | 82% |

Every row peaks in the middle. Once the pieces are developed and the threats are
on the board, the right move is easiest to see. The hard phases are the two
edges: the opening, where the position is quiet and the danger is hidden, and the
endgame, where the position is sharp and the calculation is deep.

## What to work on

The measurements turn into a simple ladder of advice.

If you lose games quickly and cannot say why, you are almost certainly a beginner
losing in the opening. Slow down through moves five to ten and stop giving pieces
away in the quiet, and you will climb a whole level on that alone.

If your openings are sound but you cannot finish, study the endgame chapter. The
skills that separate a strong player from an expert are conversion and jamming,
the two ideas that stay hard no matter how good you get. Learn to count who runs
out of moves, and to lead your attacks with a rok, and the games you used to let
slip will start to close.

## And past that

The blunder map runs out of resolution at the top. Every level in that table is
still losing games to moves that can be found by looking one or two moves ahead,
and the advice above is really advice about looking more carefully.

Above that point the errors change character. They stop being moves you failed to
calculate and start being moves you never considered. We measured how deep a
search has to go before it finds each kind of winning move, and the split is
sharp: strikes and escapes are found within two ply about eighty per cent of the
time. The quiet winners, the threat-build and the shut, are found within
two ply less than half the time, and one in six needs seven ply or more.

Seven ply is not something you calculate at a board. It is something you
recognise. That is what the next five chapters are for: not harder calculation,
but a short list of things worth seeing at a glance, each one measured rather
than asserted.
