// Read-only, unauthenticated views of games — built so a projector at a
// conference booth can show every table at once without anybody signing in on
// the projector machine.
//
// Nothing here leaks a join code, so a spectator can watch a private game but
// cannot take a seat in one. Gated by SPECTATOR_MODE so it can be switched off
// after the event without a code change.

import { Hono } from "hono";
import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "../db/client.js";
import { games, user } from "../db/schema.js";
import { env } from "../env.js";
import type { Color, GameState } from "../lib/engine.js";
import { loadGame, sweepExpiredGames } from "./games.js";

const WALL_LIMIT = 24;
// A wall of finished games is noise. Keep a few so the screen isn't empty
// between matches, but never let history crowd out a game in progress.
const FINISHED_ON_WALL = 4;

// The projector polls continuously all day, which makes it a free heartbeat for
// finalising games both players walked away from. Throttled so the sweep costs
// one scan per interval no matter how many screens are watching.
const SWEEP_INTERVAL_MS = 30_000;
let lastSweepAt = 0;

async function maybeSweep(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  try {
    await sweepExpiredGames();
  } catch (err) {
    // Never let the housekeeping break the wall.
    console.error("[spectate] sweep failed:", err);
  }
}

type GameRow = typeof games.$inferSelect;

// The public projection of a game. Deliberately omits joinCode (which would let
// a viewer sit down at someone else's table) and yourColor (meaningless here).
function publicView(game: GameRow, names: { white: string | null; black: string | null }) {
  return {
    id: game.id,
    name: game.name,
    status: game.status,
    currentTurn: game.currentTurn as Color,
    boardState: game.boardState as GameState,
    players: { white: names.white, black: names.black },
    moveCount: game.moveCount,
    winner: game.winner,
    termination: game.termination,
    lastMoveAt: game.lastMoveAt,
    turnDeadline: game.turnDeadline,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    updatedAt: game.updatedAt,
  };
}

// One batched lookup for the whole wall rather than games.ts's per-row query.
async function namesForAll(rows: GameRow[]) {
  const ids = [
    ...new Set(
      rows.flatMap((g) => [g.whitePlayerId, g.blackPlayerId]).filter(Boolean) as string[]
    ),
  ];
  const found = ids.length
    ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids))
    : [];
  const byId = new Map(found.map((r) => [r.id, r.name]));
  return (id: string | null) => (id ? byId.get(id) ?? "Deleted player" : null);
}

export const spectateRoutes = new Hono();

spectateRoutes.use("*", async (c, next) => {
  if (!env.SPECTATOR_MODE) return c.json({ error: "spectator-mode-disabled" }, 404);
  await next();
});

// The wall: every game worth looking at, board states included so one request
// paints the whole screen.
spectateRoutes.get("/games", async (c) => {
  await maybeSweep();

  const rows = await db
    .select()
    .from(games)
    .where(or(eq(games.status, "active"), eq(games.status, "finished")))
    .orderBy(desc(games.updatedAt))
    .limit(WALL_LIMIT * 2);

  // Live games first, then a handful of recent results — a booth screen should
  // lead with what people can still walk over and watch.
  const byRecency = (a: GameRow, b: GameRow) => +new Date(b.updatedAt) - +new Date(a.updatedAt);
  const active = rows.filter((g) => g.status === "active").sort(byRecency);
  const finished = rows.filter((g) => g.status !== "active").sort(byRecency);
  const ordered = [
    ...active,
    ...finished.slice(0, Math.max(0, Math.min(FINISHED_ON_WALL, WALL_LIMIT - active.length))),
  ].slice(0, WALL_LIMIT);

  const nameOf = await namesForAll(ordered);
  return c.json({
    games: ordered.map((g) =>
      publicView(g, { white: nameOf(g.whitePlayerId), black: nameOf(g.blackPlayerId) })
    ),
    serverTime: new Date().toISOString(),
    turnTimeoutSeconds: env.TURN_TIMEOUT_SECONDS,
    activeCount: ordered.filter((g) => g.status === "active").length,
  });
});

// Focus view: a single game, same shape as one wall tile.
spectateRoutes.get("/games/:id", async (c) => {
  const game = await loadGame(c.req.param("id"));
  if (!game) return c.json({ error: "game-not-found" }, 404);
  if (game.status === "waiting") return c.json({ error: "game-not-started" }, 404);

  const nameOf = await namesForAll([game]);
  return c.json({
    game: publicView(game, {
      white: nameOf(game.whitePlayerId),
      black: nameOf(game.blackPlayerId),
    }),
    serverTime: new Date().toISOString(),
    turnTimeoutSeconds: env.TURN_TIMEOUT_SECONDS,
  });
});
