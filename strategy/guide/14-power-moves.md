# The moves you are not looking at

Take a sharp position, one where a single move beats every alternative by more
than a whole piece, and ask what that move is. Three times in four it takes
something, and you would have found it.

The fourth time it takes nothing at all.

Across 28,274 such positions, the winning move was **not a strike 26.2% of the
time** (interval 25.7% to 26.7%). Those are the moves that separate a decent club
player from a strong one, and they are invisible to the search most players run,
which is: what can I take, and what can they take. Nothing is being taken. The
move looks like a pass.

## The four things a quiet move is doing

Every one of those moves is doing a job. There are four, and a single move often
does two or three at once, which is usually why it is worth a piece when nothing
else is.

| What it does | Share of the quiet winners |
|---|:---:|
| **Builds a threat**, creating a strike you did not have | 39.3% |
| **Shuts a door**, taking an empty square out of play | 21.5% |
| **Escapes**, moving a piece that was about to be taken | 15.1% |
| **Promotes**, reaching the far home base to make a rok | 11.8% |

**The threat-build.** The commonest quiet power move, and the one the
board-control chapter already showed you: because you cannot take a piece you are
already touching, an attack has to be launched from just outside contact. The
move that sets it up captures nothing and looks idle. It is the move that wins.

**The shut.** The doors chapter, turned into a weapon. The opponent's
strike needs a specific empty square to arrive on; put a piece on that square, or
force one there, and the threat is gone permanently rather than for a move. A
shut is the closest thing Tarati has to a defensive resource that does not
retreat.

**The escape.** The one most players do find, and the reason this category is
smaller than you would guess. It is not that escapes are rare, it is that they
are easy, so they rarely turn out to be the *only* move that wins by a piece.

**The promotion.** Small in share and large in consequence. See the endgame
chapter for why.

## How deep you have to look to find each one

This is the part worth memorising, because it tells you where your effort should
go. For each kind of winning move, we measured the shallowest search depth at
which the engine picks it:

| Kind of move | Median depth | Found within 2 ply | Needs 7+ ply |
|---|:---:|:---:|:---:|
| Strike | 1 | 91% | 0% |
| Promotion | 1 | 76% | 12% |
| Escape | 1 | 68% | 7% |
| Threat-build | 3 | **42%** | 20% |
| Shut | 3 | **46%** | 17% |

Strikes are one-ply moves. Nine in ten are visible by looking a single move
ahead, which is what everyone does, which is why nobody gains anything by being
good at them past a certain point.

Threat-builds and shuts sit at a median of three ply and fewer than half are
visible within two. One in five threat-builds needs seven ply or more, which at
the board means you are not going to calculate it. You will find it by
recognising the shape, or you will not find it.

That is the whole argument for learning patterns rather than calculating harder.
The moves worth learning are precisely the ones calculation does not reach.

## Two shapes to know by sight

**The step-back.** Your piece is touching an enemy and neither can hurt the
other. Step *away* to a square from which the enemy's square is two steps off,
and the threat exists again next move. It looks like a retreat. It is the attack.
The board-control chapter shows the sequence; what it did not say is that this is
the single commonest quiet winner in the game.

**The plug.** One of your pieces is takeable and you cannot move it safely. Do
not move it. Find the empty square the strike has to come through and fill that
instead. The attacker is still there, still aimed, and now permanently unable to
arrive.

![Black to move. White threatens B1-B2, arriving beside C4 and taking it, and running C4 forward to C3 does not help, because B2 covers that too. Black plays A1-B2 instead. It takes nothing and it stands in the only doorway, and the threat is gone for good.](fig:799811,786434,524288,1|arrow=A1-B2|mark=C4)

## When you are stuck, ask a different question

The practical version of this chapter is a change to the question you ask when
nothing obvious presents itself.

Most players, finding no capture, ask *what is the most active move?* and push a
cob forward. Forward moves spend road, open doors, and are irreversible: three
costs, for a move chosen because nothing else came to mind.

Ask instead, in this order:

1. **What do they threaten next move?** Not what is attacking now, what arrives.
2. **Which empty square does that threat need?** Fill it if you can.
3. **What could I threaten, if one of my pieces were one square elsewhere?** That
   square is where the threat-build goes.
4. **Only then**, if all three come up empty, advance, and advance the cob whose
   forward square is not in front of another of your cobs.

One more number, for calibration. In the 22,349 positions where the best move
settles the result outright rather than winning material, the winning move is
quiet **21.6%** of the time. So even in the most forcing positions on the board,
more than one game-deciding move in five takes nothing at all. If your search is
"what can I capture", you will lose those games without ever seeing what hit
you.
