# The opening

Tarati's opening has a peculiar shape. For the first few moves nothing you do
can lose, and then, almost without warning, a single careless step can throw the
whole game. This chapter maps that transition and names the handful of opening
ideas worth knowing.

Everything here comes from an exhaustive analysis: every distinct position
reachable in the first ten moves was enumerated and evaluated. The claims are
not gathered from games, they are what the position is.

## The first move does not matter, and there are only two of them

White has four legal opening moves, but the board's fold symmetry makes them two
ideas seen from either side. You can step a home cob **inward**, toward the hub,
with `C1-B1`. Or you can step it **around the ring**, along the outer
dodecagon, with `C1-C12`. Its mirror, `C2-C3`, is the same idea.

At perfect play the two are exactly equal, and so is every reply to them. Through
the first three moves for each side, the best move and the second-best move are
worth precisely the same. You cannot go wrong yet.

## Then it sharpens, fast

| Move (ply) | Positions | Median cost of the 2nd-best move | Where a wrong move already loses a decided game |
|-----------:|----------:|---------------------------------:|:-----------------------------------------------:|
| 1 | 4 | 0 | never |
| 2 | 16 | 0.05 | never |
| 3 | 76 | 0.03 | never |
| 4 | 357 | 0.19 | 1% of positions |
| 5 | 1,115 | 0.34 | 5% |
| 6 | 3,544 | 0.45 | 6% |
| 7 | 10,710 | 0.81 | 9% |

For three moves there is nothing to get wrong. By move five, one position in
twenty already has a losing second choice; by move seven, almost one in ten. The
opening is a short, safe corridor that opens without warning into sharp ground.

The practical lesson is about where to spend attention. Play the first few moves
quickly. Start thinking hard at move five.

## The openers are equal in theory, not in practice

That the two openings are equal at perfect play does not mean they play the same
across a board between real people. They do not. Measured over forty-eight
thousand games between engines of matched strength, starting from the true
opening position, the line the two players steer into is a real predictor of who
wins. At perfect play all roads are level; in practice some are easier to walk.

There are four common ways the first two moves go, and they score very
differently.

### The Inward Game: White steps in, Black holds the ring

![White steps inward and Black answers on the ring. White scores 51%.](seq:7889280,1573248,0,0|arrow=C1-B1|sub=1. C1-B1;;7889154,1573122,0,1|arrow=C7-C6|sub=1... C7-C6;;7885058,1573122,0,0|sub=position)

White's inward step, met by Black developing along the ring, is White's most
successful practical opening: **51% for White against 38% for Black**, the rest
drawn. The inward cob heads straight for the middle, where it is exposed but also
active, and against a quieter ring reply that activity pays.

### The Ring Game: both sides hold the ring

![Both sides step around the ring. Roughly balanced.](seq:7889280,1573248,0,0|arrow=C1-C12|sub=1. C1-C12;;8151296,1835264,0,1|arrow=C7-C6|sub=1... C7-C6;;8147200,1835264,0,0|sub=position)

When both players open around the ring the game is quiet and close to even:
**45% White, 42% Black**, and the highest draw rate of any line. This is the
opening for a player who wants a solid, low-variance game.

### The Counter-Thrust: Black answers the inward step in kind

![White steps around the ring; Black thrusts inward. Black scores 54%.](seq:7889280,1573248,0,0|arrow=C1-C12|sub=1. C1-C12;;8151296,1835264,0,1|arrow=C7-B4|sub=1... C7-B4;;8143120,1835264,0,0|sub=position)

The sharpest line, and the one most worth knowing. When White opens quietly on
the ring and Black thrusts a cob inward with `C7-B4`, it is **Black** who comes
out ahead: **54% to 36%**. Black seizes the centre first and turns White's
passivity against them. If you are White, this is the reply to respect, and a
reason not to drift into a slow ring opening without a plan.

### The Clash: both thrust inward

![Both players thrust inward at once. Sharp and balanced.](seq:7889280,1573248,0,0|arrow=C1-B1|sub=1. C1-B1;;7889154,1573122,0,1|arrow=C7-B4|sub=1... C7-B4;;7880978,1573122,0,0|sub=position)

When both players thrust inward the game is sharp and roughly even, **46% to
47%**, with the fewest draws of any line. Two cobs race for the middle and the
game is decided by who handles the resulting collisions better. This is the
fighting opening.

## What the four lines have in common

Notice the thread. The inward thrust is the aggressive move wherever it appears:
it wins for White in the Inward Game, it wins for Black in the Counter-Thrust,
and it produces the sharpest, least drawish play in the Clash. Stepping toward
the centre first is a genuine practical edge, but only if you use the piece.
The board-control chapter shows how quickly a piece left sitting in the
middle is struck. The inward step is a commitment to attack, not a place to
park. Take it when you intend to follow up, and punish an opponent who takes it
and then hesitates.
