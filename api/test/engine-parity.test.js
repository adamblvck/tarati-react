// Drift guard for the vendored server engine (api/src/lib/engine/*.js).
//
// The engine is copied from tarati-react/src by scripts/sync-engine.mjs. This
// test replays the shared golden fixture (strategy/export_parity_fixture.py,
// also used by src/__tests__/aiParity.test.js) through the *vendored* copy, so
// if someone edits src/AI.js or src/GameBoard.js without re-syncing — or the
// sync corrupts something — legal-move / evaluation parity fails here.
//
// Run with: npm test  (from api/). The sync runs first via the npm script.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import AI, { EVAL_WEIGHTS } from "../src/lib/engine/AI.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../src/__tests__/parity-fixture.json", import.meta.url), "utf8")
);
const CASES = fixture.cases;

const stateOf = (c) => ({ checkers: c.checkers, currentTurn: c.currentTurn });

const cmpMove = (a, b) => (a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
const sortMoves = (moves) => moves.map((m) => [m[0], m[1]]).sort(cmpMove);

test("fixture is present and non-trivial", () => {
  assert.equal(fixture.generator, "strategy/export_parity_fixture.py");
  assert.ok(Array.isArray(CASES) && CASES.length > 0);
});

test("evaluation weights have not drifted", () => {
  assert.deepEqual(EVAL_WEIGHTS, fixture.evalWeights);
});

test("legal move generation matches the fixture for every position", () => {
  const mismatches = [];
  CASES.forEach((c, i) => {
    const actual = sortMoves(AI.getAllPossibleMoves(stateOf(c)).map((m) => [m.from, m.to]));
    const expected = sortMoves(c.legalMoves);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      mismatches.push({ i, ply: c.ply, expected, actual });
    }
  });
  assert.deepEqual(mismatches.slice(0, 5), []);
  assert.equal(mismatches.length, 0);
});

test("static evaluation matches the fixture for every position", () => {
  const mismatches = [];
  CASES.forEach((c, i) => {
    const actual = AI.evaluateBoard(stateOf(c));
    if (actual !== c.evaluation) mismatches.push({ i, ply: c.ply, expected: c.evaluation, actual });
  });
  assert.deepEqual(mismatches.slice(0, 5), []);
  assert.equal(mismatches.length, 0);
});
