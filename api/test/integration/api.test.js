// End-to-end contract tests against a RUNNING API and a REAL database.
//
//   local:  TARATI_API_URL=http://localhost:8787 npm --prefix api run test:integration
//   prod:   TARATI_API_URL=https://tarati.blvckstudios.com npm --prefix api run test:integration
//
// Skipped entirely when TARATI_API_URL is unset, so `npm run api:test` stays a
// pure, DB-free engine drift guard.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

import AI from "../../src/lib/engine/AI.js";
import { applyMoveToBoard } from "../../src/lib/engine/GameBoard.js";
import { LINES, initialState } from "../helpers/lines.mjs";
import {
  BASE,
  PASSWORD,
  drive,
  enabled,
  gameName,
  makeJar,
  runId,
  signUpOrSignIn,
} from "../helpers/client.mjs";

const opts = { skip: enabled ? false : "set TARATI_API_URL to run integration tests" };

const alice = makeJar("alice");
const bob = makeJar("bob");
const carol = makeJar("carol");
const anon = makeJar("anon");

let users = {};
const created = []; // { id, jar } — everything we made, for teardown

async function newGame(jar, what, extra = {}) {
  const res = await jar.post("/api/v1/games", {
    name: gameName(what),
    visibility: "private",
    color: "WHITE",
    ...extra,
  });
  created.push({ id: res.game.id, jar });
  return res.game;
}

/** A fresh game with alice on White and bob on Black, already active. */
async function activeGame(what, extra = {}) {
  const game = await newGame(alice, what, extra);
  const joined = await bob.post("/api/v1/games/join", { code: game.joinCode });
  return joined.game;
}

const expectStatus = async (fn, status, code) => {
  await assert.rejects(fn, (err) => {
    assert.equal(err.status, status, `expected HTTP ${status}, got ${err.status}`);
    if (code) assert.equal(err.data?.error, code);
    return true;
  });
};

before(async () => {
  if (!enabled) return;
  users.alice = await signUpOrSignIn(alice, {
    name: "Dev Alice", email: "dev-a@example.com", password: PASSWORD,
  });
  users.bob = await signUpOrSignIn(bob, {
    name: "Dev Bob", email: "dev-b@example.com", password: PASSWORD,
  });
  users.carol = await signUpOrSignIn(carol, {
    name: "Dev Carol", email: "dev-c@example.com", password: PASSWORD,
  });
});

after(async () => {
  if (!enabled || process.env.E2E_CLEANUP === "off") return;
  // Leave nothing live: a stale e2e game sitting in the lobby during an event
  // is worse than a failing test.
  for (const { id, jar } of created) {
    try {
      const { game } = await jar.get(`/api/v1/games/${id}/state`);
      if (game.status === "waiting") await jar.post(`/api/v1/games/${id}/abort`);
      else if (game.status === "active") await jar.post(`/api/v1/games/${id}/resign`);
    } catch {
      /* already finished or gone */
    }
  }
});

// ---------------------------------------------------------------------------

describe("health + transport", opts, () => {
  test("GET /api/health is JSON from the API, not the SPA fallback", async () => {
    const res = await anon.raw("/api/health");
    assert.equal(res.status, 200);
    // If the /api/* proxy isn't wired, this is text/html and every client call
    // dies in JSON.parse with no err.status to branch on.
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("API responses are never cacheable", async () => {
    const res = await anon.raw("/api/health");
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  });
});

describe("auth + sessions", opts, () => {
  test("two jars hold two genuinely different accounts", () => {
    assert.ok(users.alice.id && users.bob.id);
    assert.notEqual(users.alice.id, users.bob.id);
    assert.equal(users.alice.email, "dev-a@example.com");
  });

  test("anonymous requests are rejected", async () => {
    const me = await anon.raw("/api/v1/me");
    assert.equal(me.status, 401);
    await expectStatus(() => anon.get("/api/v1/games/mine"), 401, "unauthorized");
  });

  test("the session survives across requests", async () => {
    const again = await alice.get("/api/v1/me");
    assert.equal(again.user.id, users.alice.id);
  });

  test("sign-out clears the session for real", async () => {
    const throwaway = makeJar("throwaway");
    const email = `dev-signout-${runId}@example.com`;
    await signUpOrSignIn(throwaway, { name: "Sign Out", email, password: PASSWORD });
    await throwaway.post("/api/auth/sign-out");
    // The regression guard for the Scaleway handler collapsing Set-Cookie: with
    // the bug, only the last of three cookies survived and the session lived on.
    const after = await throwaway.raw("/api/v1/me");
    assert.equal(after.status, 401);
  });
});

describe("lobby: create, list, join", opts, () => {
  test("creating a game seeds the opening position", async () => {
    const g = await newGame(alice, "create");
    assert.equal(g.status, "waiting");
    assert.equal(g.yourColor, "WHITE");
    assert.equal(g.moveCount, 0);
    assert.equal(g.turnDeadline, null);
    assert.match(g.joinCode, /^[A-HJ-NP-Z2-9]{6}$/); // no 0/O/1/I to misread
    assert.deepEqual(g.boardState, initialState());
  });

  test("public games appear to others and not to their creator", async () => {
    const g = await newGame(alice, "public", { visibility: "public" });
    const forBob = await bob.get("/api/v1/games/open");
    const forAlice = await alice.get("/api/v1/games/open");
    assert.ok(forBob.games.some((x) => x.id === g.id), "bob should see the open game");
    assert.ok(!forAlice.games.some((x) => x.id === g.id), "alice should not see her own");
  });

  test("joining by code seats the opponent and starts the clock", async () => {
    const g = await newGame(alice, "join-code");
    const joined = await bob.post("/api/v1/games/join", { code: g.joinCode });
    assert.equal(joined.game.status, "active");
    assert.equal(joined.game.yourColor, "BLACK");
    assert.ok(joined.game.startedAt);
    assert.ok(
      Date.parse(joined.game.turnDeadline) > Date.parse(joined.game.serverTime),
      "turn deadline must be in the server's future"
    );
  });

  test("joining by id works too", async () => {
    const g = await newGame(alice, "join-id", { visibility: "public" });
    const joined = await bob.post(`/api/v1/games/${g.id}/join`);
    assert.equal(joined.game.status, "active");
  });

  test("you cannot join your own game while it waits", async () => {
    const g = await newGame(alice, "self-join");
    await expectStatus(() => alice.post("/api/v1/games/join", { code: g.joinCode }), 409, "already-in-game");
  });

  test("once a game is full nobody else can take a seat", async () => {
    const g = await activeGame("join-guards");
    // The status guard runs before the seat guard, so everyone — including the
    // players already in it — gets game-not-joinable once it's under way.
    await expectStatus(() => bob.post("/api/v1/games/join", { code: g.joinCode }), 409, "game-not-joinable");
    await expectStatus(() => carol.post("/api/v1/games/join", { code: g.joinCode }), 409, "game-not-joinable");
  });

  test("an unknown code is a 404", async () => {
    await expectStatus(() => bob.post("/api/v1/games/join", { code: "ZZZZZZ" }), 404, "game-not-found");
  });

  test("only the creator can abort, and only while waiting", async () => {
    const g = await newGame(alice, "abort");
    await expectStatus(() => bob.post(`/api/v1/games/${g.id}/abort`), 403);
    const aborted = await alice.post(`/api/v1/games/${g.id}/abort`);
    assert.equal(aborted.game.status, "aborted");
    await expectStatus(() => alice.post(`/api/v1/games/${g.id}/abort`), 409, "not-abortable");
  });
});

describe("move protocol", opts, () => {
  test("turn order, legality and ply are all enforced", async () => {
    const g = await activeGame("move-protocol");

    // Black moving first.
    await assert.rejects(
      () => bob.post(`/api/v1/games/${g.id}/moves`, { from: "C7", to: "B4", ply: 0 }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.data.error, "not-your-turn");
        // The body carries authoritative state so the client can reconcile.
        assert.equal(err.data.game.moveCount, 0);
        return true;
      }
    );

    // A non-edge move.
    await expectStatus(
      () => alice.post(`/api/v1/games/${g.id}/moves`, { from: "C1", to: "C7", ply: 0 }),
      422,
      "illegal-move"
    );

    // Right move, wrong ply.
    await expectStatus(
      () => alice.post(`/api/v1/games/${g.id}/moves`, { from: "C1", to: "B1", ply: 5 }),
      409,
      "ply-conflict"
    );

    const ok = await alice.post(`/api/v1/games/${g.id}/moves`, { from: "C1", to: "B1", ply: 0 });
    assert.equal(ok.game.moveCount, 1);
    assert.equal(ok.game.currentTurn, "BLACK");
    assert.ok(ok.game.boardState.checkers.B1);
    assert.ok(!ok.game.boardState.checkers.C1);
  });

  test("re-sending your own last move is an idempotent 200, not a conflict", async () => {
    const g = await activeGame("idempotent");
    await alice.post(`/api/v1/games/${g.id}/moves`, { from: "C1", to: "B1", ply: 0 });
    // A phone on booth wifi that lost the response and resent must not be
    // punished — and must not be told "not your turn", which is what happens
    // if the turn check runs before the retry check.
    const replay = await alice.post(`/api/v1/games/${g.id}/moves`, { from: "C1", to: "B1", ply: 0 });
    assert.equal(replay.game.moveCount, 1);

    // The opponent sending a stale ply is still a genuine conflict.
    await expectStatus(
      () => bob.post(`/api/v1/games/${g.id}/moves`, { from: "C7", to: "B4", ply: 0 }),
      409,
      "ply-conflict"
    );
  });

  test("a double-tap submitting the same move twice advances the game once", async () => {
    const g = await activeGame("double-tap");
    const move = { from: "C1", to: "B1", ply: 0 };
    const results = await Promise.allSettled([
      alice.post(`/api/v1/games/${g.id}/moves`, move),
      alice.post(`/api/v1/games/${g.id}/moves`, move),
    ]);
    assert.ok(results.some((r) => r.status === "fulfilled"), "at least one must succeed");
    const { game } = await alice.get(`/api/v1/games/${g.id}/state`);
    assert.equal(game.moveCount, 1, "the (game_id, ply) unique index must collapse the duplicate");
  });

  test("resigning ends the game and locks it", async () => {
    const g = await activeGame("resign");
    const res = await alice.post(`/api/v1/games/${g.id}/resign`);
    assert.equal(res.game.status, "finished");
    assert.equal(res.game.winner, "BLACK");
    assert.equal(res.game.termination, "resign");
    await expectStatus(
      () => bob.post(`/api/v1/games/${g.id}/moves`, { from: "C7", to: "B4", ply: 1 }),
      409,
      "game-over"
    );
  });
});

describe("terminal conditions", opts, () => {
  test("total conversion: the loser has no pieces left", async () => {
    const line = LINES.totalConversion();
    const g = await activeGame("total-conversion");
    const final = await drive({ white: alice, black: bob }, g.id, line.moves);
    assert.equal(final.status, "finished");
    assert.equal(final.winner, line.winner);
    assert.equal(final.termination, "total_conversion");
    assert.equal(final.moveCount, line.moves.length);
    assert.equal(final.turnDeadline, null);
    const losers = Object.values(final.boardState.checkers).filter(
      (c) => c.color !== line.winner
    );
    assert.equal(losers.length, 0);
  });

  test("no legal moves: the loser still has pieces but cannot move", async () => {
    const line = LINES.noLegalMoves();
    const g = await activeGame("no-legal-moves");
    const final = await drive({ white: alice, black: bob }, g.id, line.moves);
    assert.equal(final.winner, line.winner);
    assert.equal(final.termination, "no_legal_moves");
    // The assertion that distinguishes this from total_conversion.
    const losers = Object.values(final.boardState.checkers).filter(
      (c) => c.color !== line.winner
    );
    assert.ok(losers.length > 0, "loser should still be on the board");
  });

  test("threefold repetition is a draw", async () => {
    const line = LINES.threefold();
    const g = await activeGame("threefold");
    const final = await drive({ white: alice, black: bob }, g.id, line.moves);
    assert.equal(final.winner, "DRAW");
    assert.equal(final.termination, "threefold");
    assert.equal(final.moveCount, line.moves.length);
  });
});

describe("§6.3 in-place promotion", opts, () => {
  test("a promotion-only position is playable and only then", async () => {
    const line = LINES.promotionOnly();
    const g = await activeGame("promotion");
    const state = await drive({ white: alice, black: bob }, g.id, line.moves);

    assert.equal(state.status, "active");
    assert.equal(state.moveCount, line.moves.length);

    // The engine and the server must agree this position is promotion-only.
    const legal = AI.getAllPossibleMoves(state.boardState);
    assert.ok(legal.length > 0);
    assert.ok(
      legal.every((m) => m.from === m.to),
      "fixture must reach a position whose only moves are promotions"
    );
    const vertex = line.promotions[0];
    const mover = state.currentTurn;
    const jar = mover === "WHITE" ? alice : bob;

    // Before the fix, the UI could not express this and the player forfeited.
    const res = await jar.post(`/api/v1/games/${g.id}/moves`, {
      from: vertex,
      to: vertex,
      ply: line.moves.length,
    });
    assert.equal(res.game.moveCount, line.moves.length + 1);
    assert.equal(res.game.boardState.checkers[vertex].isUpgraded, true);
    assert.equal(res.game.currentTurn, mover === "WHITE" ? "BLACK" : "WHITE");
    assert.equal(res.game.status, "active");
  });

  test("an in-place move is illegal when an ordinary move exists", async () => {
    const g = await activeGame("promotion-negative");
    await expectStatus(
      () => alice.post(`/api/v1/games/${g.id}/moves`, { from: "C1", to: "C1", ply: 0 }),
      422,
      "illegal-move"
    );
  });
});

describe("replay + history", opts, () => {
  test("a replay reconstructs exactly to the final position", async () => {
    const line = LINES.noLegalMoves();
    const g = await activeGame("replay");
    const final = await drive({ white: alice, black: bob }, g.id, line.moves);

    const replay = await alice.get(`/api/v1/games/${g.id}/replay`);
    assert.equal(replay.moves.length, line.moves.length);
    assert.deepEqual(replay.start, initialState());
    replay.moves.forEach((m, i) => {
      assert.equal(m.ply, i, "plies must be contiguous and ascending");
      assert.equal(m.color, i % 2 === 0 ? "WHITE" : "BLACK");
    });

    // Exactly what ReplayViewer does client-side.
    let s = replay.start;
    for (const m of replay.moves) {
      s = {
        ...applyMoveToBoard(s, m.from, m.to),
        currentTurn: s.currentTurn === "WHITE" ? "BLACK" : "WHITE",
      };
    }
    assert.deepEqual(s.checkers, final.boardState.checkers);
  });

  test("your history lists your games with the colour you played", async () => {
    const mine = await alice.get("/api/v1/games/mine");
    const ours = mine.games.filter((x) => x.name.startsWith(`e2e ${runId} `));
    assert.ok(ours.length > 0, "alice should see this run's games");
    assert.ok(ours.every((x) => x.yourColor === "WHITE"));
  });
});

describe("access control", opts, () => {
  test("a non-participant is refused every game endpoint", async () => {
    const g = await activeGame("access");
    for (const [path, init] of [
      [`/api/v1/games/${g.id}/state`, undefined],
      [`/api/v1/games/${g.id}/replay`, undefined],
    ]) {
      await expectStatus(() => carol.json(path, init), 403);
    }
    await expectStatus(
      () => carol.post(`/api/v1/games/${g.id}/moves`, { from: "C1", to: "B1", ply: 0 }),
      403
    );
    await expectStatus(() => carol.post(`/api/v1/games/${g.id}/resign`), 403);

    const mine = await carol.get("/api/v1/games/mine");
    assert.ok(!mine.games.some((x) => x.id === g.id));
  });

  test("an unknown game id is 404, not 403", async () => {
    // Ordering matters: the other way round leaks which ids exist.
    await expectStatus(() => carol.get("/api/v1/games/does-not-exist-at-all/state"), 404);
  });

  test("the cron sweep endpoint refuses a missing or wrong secret", async () => {
    const a = await anon.raw("/api/v1/internal/games/sweep-timeouts", { method: "POST" });
    assert.equal(a.status, 403);
    const b = await anon.raw("/api/v1/internal/games/sweep-timeouts", {
      method: "POST",
      headers: { "x-cron-secret": "definitely-not-it" },
    });
    assert.equal(b.status, 403);
  });
});

describe("spectator mode", opts, () => {
  test("anyone can watch live games without an account", async () => {
    const g = await activeGame("spectate");
    await alice.post(`/api/v1/games/${g.id}/moves`, { from: "C1", to: "B1", ply: 0 });

    const wall = await anon.get("/api/v1/spectate/games");
    const mine = wall.games.find((x) => x.id === g.id);
    assert.ok(mine, "an active game must appear on the wall");
    assert.equal(mine.status, "active");
    assert.equal(mine.moveCount, 1);
    assert.ok(mine.boardState.checkers.B1, "the wall needs board state to draw");
    assert.equal(mine.players.white, "Dev Alice");
    assert.equal(mine.players.black, "Dev Bob");

    // A spectator must not be handed the key to the table.
    assert.equal(mine.joinCode, undefined);
    assert.equal(mine.yourColor, undefined);

    const solo = await anon.get(`/api/v1/spectate/games/${g.id}`);
    assert.equal(solo.game.id, g.id);
    assert.equal(solo.game.joinCode, undefined);
    assert.equal(solo.turnTimeoutSeconds, wall.turnTimeoutSeconds);
  });

  test("games still waiting for an opponent are not exposed", async () => {
    const g = await newGame(alice, "spectate-waiting");
    await expectStatus(() => anon.get(`/api/v1/spectate/games/${g.id}`), 404);
    const wall = await anon.get("/api/v1/spectate/games");
    assert.ok(!wall.games.some((x) => x.id === g.id));
  });
});

describe("configuration", opts, () => {
  test("the turn clock is long enough for a conference", async () => {
    const wall = await anon.get("/api/v1/spectate/games");
    assert.ok(
      wall.turnTimeoutSeconds >= 300,
      `turn timeout is ${wall.turnTimeoutSeconds}s — too short for people who talk between moves`
    );
  });

  test("the base URL under test is reported", () => {
    assert.ok(BASE, "TARATI_API_URL must be set");
  });
});
