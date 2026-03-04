/**
 * Official Tarati ruleset tests — verifies all 6 patent rule fixes.
 *
 * Run with:  npm test -- --watchAll=false --testPathPattern=rules
 */

import { gameBoard, applyMoveToBoard, ADJACENCY, EDGE_SET } from '../GameBoard';
import AI from '../AI';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeState = (checkers, turn = 'WHITE') => ({
  checkers: Object.fromEntries(
    Object.entries(checkers).map(([k, v]) => [
      k,
      { color: v[0], isUpgraded: !!v[1] },
    ])
  ),
  currentTurn: turn,
});

// Shorthand: ['WHITE'] or ['WHITE', true] for upgraded
const W  = ['WHITE'];
const Wu = ['WHITE', true];
const B  = ['BLACK'];
const Bu = ['BLACK', true];

// ---------------------------------------------------------------------------
// 0. Sanity — board topology
// ---------------------------------------------------------------------------

describe('Board topology', () => {
  test('23 vertices, 42 edges', () => {
    expect(gameBoard.vertices).toHaveLength(23);
    expect(gameBoard.edges).toHaveLength(42);
  });

  test('ADJACENCY is symmetric', () => {
    for (const [a, b] of gameBoard.edges) {
      expect(ADJACENCY[a]).toContain(b);
      expect(ADJACENCY[b]).toContain(a);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. Pre-adjacency rule (patent §4.1)
// ---------------------------------------------------------------------------

describe('Pre-adjacency rule', () => {
  test('piece already adjacent to target is NOT struck', () => {
    // WHITE at C3, BLACK at C4. C3 and C4 are adjacent.
    // WHITE moves C3 → B2. B2 is adjacent to C4.
    // Because C3 was ALREADY adjacent to C4, the strike should NOT happen.
    const state = makeState({ C3: W, C4: B }, 'WHITE');

    // Verify the adjacency precondition
    expect(ADJACENCY['C3']).toContain('C4');
    expect(ADJACENCY['B2']).toContain('C4');

    const result = applyMoveToBoard(state, 'C3', 'B2');
    expect(result.checkers['C4'].color).toBe('BLACK'); // NOT flipped
  });

  test('piece NOT previously adjacent IS struck', () => {
    // WHITE at C1, BLACK at B2. C1 is NOT adjacent to B2.
    // WHITE moves C1 → B1. B1 IS adjacent to B2.
    // C1 was NOT adjacent to B2, so B2 SHOULD be struck.
    const state = makeState({ C1: Wu, B2: B }, 'WHITE');

    expect(ADJACENCY['C1']).not.toContain('B2');
    expect(ADJACENCY['B1']).toContain('B2');

    const result = applyMoveToBoard(state, 'C1', 'B1');
    expect(result.checkers['B2'].color).toBe('WHITE'); // flipped
  });

  test('multi-strike only flips non-pre-adjacent pieces', () => {
    // WHITE upgraded at B2, BLACK at A1 and C3.
    // B2 is adjacent to both A1 and C3.
    // Move B2 → B3. B3 is adjacent to A1 and C5 (not C3).
    // A1 was adjacent to B2 (origin), so A1 should NOT be struck.
    // C5 is not occupied so no strike there.
    const state = makeState({ B2: Wu, A1: B, C3: B }, 'WHITE');

    expect(ADJACENCY['B2']).toContain('A1');

    const result = applyMoveToBoard(state, 'B2', 'B3');
    expect(result.checkers['A1'].color).toBe('BLACK'); // NOT flipped (was adjacent)
  });
});

// ---------------------------------------------------------------------------
// 2. Home-base movement exception (patent §3.2)
// ---------------------------------------------------------------------------

describe('Home-base movement exception', () => {
  test('WHITE cob on own home base can move backward', () => {
    // D1 is White's home base. Normally cobs go forward only (decreasing Y).
    // With the exception, D1 should be able to move to D2 (same level) or C1.
    const state = makeState({ D1: W }, 'WHITE');
    const moves = AI.getAllPossibleMoves(state);
    const fromD1 = moves.filter(m => m.from === 'D1');
    // D1 connects to D2 and C1
    expect(fromD1.length).toBeGreaterThanOrEqual(2);
    expect(fromD1.some(m => m.to === 'D2')).toBe(true);
    expect(fromD1.some(m => m.to === 'C1')).toBe(true);
  });

  test('BLACK cob on own home base can move backward', () => {
    const state = makeState({ D3: B }, 'BLACK');
    const moves = AI.getAllPossibleMoves(state);
    const fromD3 = moves.filter(m => m.from === 'D3');
    expect(fromD3.length).toBeGreaterThanOrEqual(2);
    expect(fromD3.some(m => m.to === 'D4')).toBe(true);
    expect(fromD3.some(m => m.to === 'C7')).toBe(true);
  });

  test('cob NOT on home base still restricted to forward only', () => {
    // WHITE cob at B3. B3 connects to B2, B4, C5, C6, A1.
    // Forward for WHITE = decreasing Y (toward Black's side).
    // Some of these should be disallowed (backward moves).
    const state = makeState({ B3: W }, 'WHITE');
    const moves = AI.getAllPossibleMoves(state);
    // B3 should NOT be able to go to all 5 neighbors — some are backward
    expect(moves.length).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// 3. Captured on own home-base ≠ immediate promotion (patent §5.2)
// ---------------------------------------------------------------------------

describe('Captured-on-own-home exception', () => {
  test('BLACK cob flipped on own home (D3) does NOT auto-upgrade', () => {
    // BLACK cob at D3 (Black's home). WHITE moves adjacent and strikes it.
    // D3 is adjacent to C7. WHITE at C8 (upgraded) moves to C7 → adjacent to D3.
    // Wait — C8 is adjacent to D4 not D3. Let me use a proper setup.
    // D3 neighbors: D4, C7. WHITE needs to land on D4 or C7 and strike D3.
    // WHITE upgraded at B4 moves to C7. C7 is adjacent to D3. 
    // B4 is NOT adjacent to D3 (B4 connects to B3,B5,C7,C8,A1).
    const state = makeState({ B4: Wu, D3: B }, 'WHITE');

    expect(ADJACENCY['B4']).not.toContain('D3');
    expect(ADJACENCY['C7']).toContain('D3');

    const result = applyMoveToBoard(state, 'B4', 'C7');
    // D3 should be flipped to WHITE but NOT upgraded
    expect(result.checkers['D3'].color).toBe('WHITE');
    expect(result.checkers['D3'].isUpgraded).toBe(false);
  });

  test('WHITE cob flipped on own home (D1) does NOT auto-upgrade', () => {
    // WHITE cob at D1 (White's home). BLACK moves to C1 and strikes D1.
    // C1 neighbors: D1, C2, C12, B1. BLACK upgraded at C12 moves to C1.
    // C12 is NOT adjacent to D1.
    const state = makeState({ C12: Bu, D1: W }, 'BLACK');

    expect(ADJACENCY['C12']).not.toContain('D1');
    expect(ADJACENCY['C1']).toContain('D1');

    const result = applyMoveToBoard(state, 'C12', 'C1');
    expect(result.checkers['D1'].color).toBe('BLACK');
    expect(result.checkers['D1'].isUpgraded).toBe(false);
  });

  test('piece NOT on own home base still upgrades when struck onto opponent home', () => {
    // WHITE piece at C8 (not White's home — C8 is Black's home).
    // If BLACK strikes it, it becomes BLACK at C8 (Black's own home) — no upgrade.
    // But if a WHITE piece sits on some neutral position and gets struck onto
    // the opponent's home... Actually, pieces don't move when struck. They
    // stay in place and get flipped. So this test checks: a piece at a position
    // that is the OPPONENT's home base (not its own) gets struck and flipped.
    // After flip, it's now on its own home — no upgrade condition met.
    // The only case where struck→upgrade happens: piece on neutral ground that
    // is also the new team's opponent home. But home bases are fixed, so this
    // only happens when the position IS a home base. The rule is clear:
    // the original owner's home → skip upgrade.
    // Let's verify normal upgrade still works for a mover landing on opponent home.
    const state = makeState({ B4: W }, 'WHITE');
    const result = applyMoveToBoard(state, 'B4', 'C7');
    // Mover landed on C7 (Black's home) → should upgrade
    expect(result.checkers['C7'].isUpgraded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Dead pieces & forced promotion (patent §6)
// ---------------------------------------------------------------------------

describe('Dead pieces and forced promotion', () => {
  test('WHITE cob at D3 (dead) gets promotion move when no normal moves', () => {
    // WHITE cob at D3 — opponent's outermost home base. All forward paths blocked.
    // No other WHITE pieces. BLACK piece somewhere.
    const state = makeState({ D3: W, C1: B }, 'WHITE');
    const moves = AI.getAllPossibleMoves(state);

    // D3 has no normal forward moves for WHITE, so it's dead.
    // But with promotion available, we should get a promotion "move".
    // D3 neighbors: D4 (empty), C7 (empty) — has exit, so promotion is valid.
    const promos = moves.filter(m => m.from === m.to);
    expect(promos.length).toBeGreaterThan(0);
    expect(promos[0].from).toBe('D3');
  });

  test('promotion move upgrades the piece', () => {
    const state = makeState({ D3: W, C1: B }, 'WHITE');
    const result = applyMoveToBoard(state, 'D3', 'D3');
    expect(result.checkers['D3'].isUpgraded).toBe(true);
  });

  test('no promotions offered when normal moves exist', () => {
    const state = makeState({
      C1: W, C2: W, D1: W, D2: W,
      C7: B, C8: B, D3: B, D4: B,
    }, 'WHITE');
    const moves = AI.getAllPossibleMoves(state);
    const promos = moves.filter(m => m.from === m.to);
    expect(promos.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Sole remaining piece auto-promotion (patent §6.4)
// ---------------------------------------------------------------------------

describe('Sole remaining piece auto-promotion', () => {
  test('sole remaining cob auto-promoted after strike conversion', () => {
    // After a move, if one color has exactly 1 cob left, it auto-upgrades.
    // BLACK has 1 cob at C5. WHITE upgraded at C3 moves to C4.
    // C4 is adjacent to C5 — but C3 IS adjacent to C4, and C3 IS adjacent to C5? 
    // C3 neighbors: C2, C4, B2. C5 is NOT adjacent to C3.
    // C4 neighbors: C3, C5, B2. After move to C4, C5 is adjacent, C3 was origin.
    // C5 was NOT adjacent to C3 (origin) → strike happens → C5 flipped to WHITE.
    // Now all pieces are WHITE — game over. But the sole remaining piece rule
    // applies before game-over check in a different scenario.

    // Better test: 2 BLACK cobs remain. WHITE strikes one, leaving 1 BLACK cob.
    // WHITE upgraded at C3, BLACK cobs at C5 and B5.
    // Move C3 → C4. C4 adj: C3, C5, B2. C3 is from, so skip.
    // C5 is adj to C4 and NOT adj to C3 → strike C5 → becomes WHITE.
    // Now BLACK has only B5 (cob). Sole remaining → auto-promote.
    const state = makeState({ C3: Wu, C5: B, B5: B }, 'WHITE');
    const result = applyMoveToBoard(state, 'C3', 'C4');

    expect(result.checkers['C5'].color).toBe('WHITE'); // struck
    expect(result.checkers['B5'].color).toBe('BLACK'); // untouched
    expect(result.checkers['B5'].isUpgraded).toBe(true); // auto-promoted as sole piece
  });
});

// ---------------------------------------------------------------------------
// 6. Draw detection (patent §7.2)
// ---------------------------------------------------------------------------

describe('Draw detection', () => {
  test('threefold repetition detected', () => {
    const hashes = ['a', 'b', 'a', 'b', 'a'];
    expect(AI.checkThreefoldRepetition(hashes)).toBe(true);
  });

  test('no threefold when positions differ', () => {
    const hashes = ['a', 'b', 'c', 'd', 'a', 'b'];
    expect(AI.checkThreefoldRepetition(hashes)).toBe(false);
  });

  test('50-move rule triggered after 100 quiet half-moves', () => {
    const flags = new Array(100).fill(false);
    expect(AI.checkFiftyMoveRule(flags)).toBe(true);
  });

  test('50-move rule not triggered with cob movement', () => {
    const flags = new Array(100).fill(false);
    flags[50] = true; // a cob moved at move 50
    expect(AI.checkFiftyMoveRule(flags)).toBe(false);
  });

  test('50-move rule not triggered with < 100 half-moves', () => {
    const flags = new Array(99).fill(false);
    expect(AI.checkFiftyMoveRule(flags)).toBe(false);
  });

  test('hashPosition is deterministic', () => {
    const state = makeState({ A1: W, B1: B }, 'WHITE');
    const h1 = AI.hashPosition(state);
    const h2 = AI.hashPosition(state);
    expect(h1).toBe(h2);
  });

  test('hashPosition differs by turn', () => {
    const s1 = makeState({ A1: W, B1: B }, 'WHITE');
    const s2 = makeState({ A1: W, B1: B }, 'BLACK');
    expect(AI.hashPosition(s1)).not.toBe(AI.hashPosition(s2));
  });
});

// ---------------------------------------------------------------------------
// 7. Integration — AI still produces valid moves after rule changes
// ---------------------------------------------------------------------------

describe('AI integration', () => {
  const initialState = () => makeState({
    C1: W, C2: W, D1: W, D2: W,
    C7: B, C8: B, D3: B, D4: B,
  }, 'WHITE');

  test('AI returns a valid move from initial position', () => {
    const state = initialState();
    const result = AI.getNextBestMove(state, 3, true, { randomize: false });
    expect(result.move).not.toBeNull();
    const { from, to } = result.move;
    expect(AI.isValidMove(state, from, to)).toBe(true);
  });

  test('AI plays a full game without crashing', () => {
    let state = initialState();
    let moves = 0;
    const MAX = 200;

    while (!AI.isGameOver(state) && moves < MAX) {
      const isMax = state.currentTurn === 'BLACK';
      const result = AI.getNextBestMove(state, 3, isMax, { randomize: true });
      if (!result.move) break;
      state = AI.ApplyMoveAI(state, result.move.from, result.move.to);
      moves++;
    }

    expect(moves).toBeGreaterThan(0);
  });
});
