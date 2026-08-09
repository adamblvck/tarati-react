/**
 * Golden-fixture parity between src/AI.js and strategy/engine/{bitboard,ai}.py.
 *
 * AI_ENGINE.md describes the JavaScript engine as a direct port of the Python
 * one, but nothing enforced it and the two drifted while sharing the same four
 * search bugs. `strategy/export_parity_fixture.py` writes the fixture; both
 * sides assert against it.
 *
 * The fixture is ground truth. If an assertion here fails, fix the port — do
 * not relax the assertion or regenerate the fixture.
 *
 * Parity is required on observable behaviour — legal moves, evaluation, and the
 * full set of root scores at fixed depth — but deliberately not on internal
 * transposition hashes: Python uses 64-bit Zobrist keys, which JavaScript
 * cannot represent in its 32-bit bitwise operators, and the depth-exact table
 * rule makes both engines transposition-transparent anyway.
 *
 * Run with:
 *   CI=true npx react-scripts test --testPathPattern='aiParity' --watchAll=false
 */

import fixture from './parity-fixture.json';
import AI, { EVAL_WEIGHTS, VERTICES } from '../AI';

// 380 positions x three iterative-deepening searches each; well past the 5s
// default.
jest.setTimeout(30 * 60 * 1000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CASES = fixture.cases;
const DEPTHS = fixture.searchDepths;

const stateOf = (fixtureCase) => ({
  checkers: fixtureCase.checkers,
  currentTurn: fixtureCase.currentTurn,
});

const describeCase = (fixtureCase, index) =>
  `case ${index} (ply ${fixtureCase.ply}, ${fixtureCase.currentTurn} to move, `
  + `${Object.keys(fixtureCase.checkers).length} pieces)`;

/** Lexicographic on [from, to] — matches Python's tuple ordering. */
const cmpMove = (a, b) => {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
};

/** Lexicographic on [[from, to], score] — matches Python's list ordering. */
const cmpRootScore = (a, b) => {
  const byMove = cmpMove(a[0], b[0]);
  return byMove !== 0 ? byMove : a[1] - b[1];
};

const sortMoves = (moves) => moves.map((m) => [m[0], m[1]]).sort(cmpMove);
const sortRootScores = (rows) => rows.map((r) => [[r[0][0], r[0][1]], r[1]]).sort(cmpRootScore);

const asPair = (move) => (move ? [move.from, move.to] : null);

/** Fail loudly with the offending cases listed, not just a count. */
const expectNoMismatches = (mismatches) => {
  expect(mismatches.slice(0, 5)).toEqual([]);
  expect(mismatches).toHaveLength(0);
};

// Searching is the expensive part, so every case/depth combination is searched
// exactly once and the assertions below read the cached results.
const searchResults = new Map();
const resultKey = (index, depth) => `${index}:${depth}`;

beforeAll(() => {
  CASES.forEach((fixtureCase, index) => {
    for (const depth of DEPTHS) {
      searchResults.set(resultKey(index, depth), AI.getNextBestMove(
        stateOf(fixtureCase),
        depth,
        null, // isMaximizing is ignored; min/max follows currentTurn
        {
          randomize: false, // deterministic — no sampling in parity assertions
          maxNodes: null,
          maxMs: null,
          useTt: true,
        },
      ));
    }
  });
});

// ---------------------------------------------------------------------------
// Fixture sanity
// ---------------------------------------------------------------------------

describe('parity fixture', () => {
  test('is the expected shape', () => {
    expect(fixture.generator).toBe('strategy/export_parity_fixture.py');
    expect(Array.isArray(CASES)).toBe(true);
    expect(CASES.length).toBeGreaterThan(0);
    expect(DEPTHS).toEqual([2, 4, 6]);
  });

  test('vertex encoding matches the JS engine', () => {
    expect(fixture.encoding.vertices).toEqual([...VERTICES]);
  });

  test('evaluation weights have not drifted from the Python engine', () => {
    // Asserted so a change to either side's weights fails here rather than
    // showing up as a wall of unexplained evaluation mismatches.
    expect(EVAL_WEIGHTS).toEqual(fixture.evalWeights);
  });
});

// ---------------------------------------------------------------------------
// Rules parity
// ---------------------------------------------------------------------------

describe('legal move generation', () => {
  test('matches the Python engine for every fixture position', () => {
    const mismatches = [];
    CASES.forEach((fixtureCase, index) => {
      // from === to denotes a dead-piece promotion under patent §6.3.
      const actual = sortMoves(AI.getAllPossibleMoves(stateOf(fixtureCase))
        .map((m) => [m.from, m.to]));
      const expected = sortMoves(fixtureCase.legalMoves);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push({ case: describeCase(fixtureCase, index), expected, actual });
      }
    });
    expectNoMismatches(mismatches);
  });
});

describe('static evaluation', () => {
  test('matches the Python engine exactly for every fixture position', () => {
    const mismatches = [];
    CASES.forEach((fixtureCase, index) => {
      const actual = AI.evaluateBoard(stateOf(fixtureCase));
      if (actual !== fixtureCase.evaluation) {
        mismatches.push({
          case: describeCase(fixtureCase, index),
          expected: fixtureCase.evaluation,
          actual,
        });
      }
    });
    expectNoMismatches(mismatches);
  });
});

// ---------------------------------------------------------------------------
// Search parity
// ---------------------------------------------------------------------------

describe.each(DEPTHS)('search at depth %i', (depth) => {
  test('root scores match the Python engine', () => {
    const mismatches = [];
    CASES.forEach((fixtureCase, index) => {
      const result = searchResults.get(resultKey(index, depth));
      // The fixture is pre-sorted so tie-break ordering may differ between the
      // two implementations without being a parity failure.
      const actual = sortRootScores(result.scores.map(([m, s]) => [[m.from, m.to], s]));
      const expected = sortRootScores(fixtureCase.searches[String(depth)].rootScores);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push({ case: describeCase(fixtureCase, index), expected, actual });
      }
    });
    expectNoMismatches(mismatches);
  });

  test('scores match the Python engine', () => {
    const mismatches = [];
    CASES.forEach((fixtureCase, index) => {
      const result = searchResults.get(resultKey(index, depth));
      const expected = fixtureCase.searches[String(depth)].score;
      if (result.score !== expected) {
        mismatches.push({
          case: describeCase(fixtureCase, index),
          expected,
          actual: result.score,
        });
      }
    });
    expectNoMismatches(mismatches);
  });

  test('chosen moves match the Python engine', () => {
    const mismatches = [];
    CASES.forEach((fixtureCase, index) => {
      const result = searchResults.get(resultKey(index, depth));
      const expected = fixtureCase.searches[String(depth)].move;
      const actual = asPair(result.move);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push({ case: describeCase(fixtureCase, index), expected, actual });
      }
    });
    expectNoMismatches(mismatches);
  });
});
