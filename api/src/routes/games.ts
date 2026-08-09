import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.js";
import { games, gameMoves, auditEvents, user } from "../db/schema.js";
import { makeId, makeJoinCode } from "../lib/id.js";
import { requireAuth, type AppVariables } from "../lib/http.js";
import { env } from "../env.js";
import {
  type Color,
  type GameState,
  applyMove,
  canonicalKey,
  checkFiftyMoveRule,
  checkThreefoldRepetition,
  initialGameState,
  isGameOver,
  isMoveLegal,
  opponent,
  wasCobMove,
} from "../lib/engine.js";

type GameRow = typeof games.$inferSelect;

const TIMEOUT_MS = env.TURN_TIMEOUT_SECONDS * 1000;

// --- validation schemas ----------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(["private", "public"]).default("private"),
  color: z.enum(["WHITE", "BLACK", "random"]).default("random"),
});

const joinByCodeSchema = z.object({
  code: z.string().trim().min(3).max(12),
});

const moveSchema = z.object({
  from: z.string().trim().min(1).max(3),
  to: z.string().trim().min(1).max(3),
  ply: z.number().int().min(0),
});

// --- helpers ---------------------------------------------------------------

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function loadGame(id: string): Promise<GameRow | null> {
  const [row] = await db.select().from(games).where(eq(games.id, id)).limit(1);
  return row ?? null;
}

function colorOf(game: GameRow, userId: string): Color | null {
  if (game.whitePlayerId === userId) return "WHITE";
  if (game.blackPlayerId === userId) return "BLACK";
  return null;
}

function isParticipant(game: GameRow, userId: string): boolean {
  return (
    game.whitePlayerId === userId ||
    game.blackPlayerId === userId ||
    game.createdBy === userId
  );
}

export async function playerNames(game: GameRow) {
  const ids = [game.whitePlayerId, game.blackPlayerId].filter(Boolean) as string[];
  const rows = ids.length
    ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  const view = (id: string | null) =>
    id ? { id, name: byId.get(id) ?? "Deleted player" } : null;
  return { white: view(game.whitePlayerId), black: view(game.blackPlayerId) };
}

async function stateView(game: GameRow, userId: string) {
  const players = await playerNames(game);
  return {
    id: game.id,
    name: game.name,
    status: game.status,
    visibility: game.visibility,
    joinCode: game.joinCode,
    boardState: game.boardState as GameState,
    currentTurn: game.currentTurn as Color,
    players,
    yourColor: colorOf(game, userId),
    winner: game.winner,
    termination: game.termination,
    moveCount: game.moveCount,
    lastMoveAt: game.lastMoveAt,
    turnDeadline: game.turnDeadline,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    createdAt: game.createdAt,
    serverTime: new Date().toISOString(),
    turnTimeoutSeconds: env.TURN_TIMEOUT_SECONDS,
  };
}

// Finalise a game as forfeited-on-time if its active turn deadline has passed.
// Returns the (possibly updated) game row.
async function maybeForfeit(game: GameRow): Promise<GameRow> {
  if (game.status !== "active" || !game.turnDeadline) return game;
  if (Date.now() <= new Date(game.turnDeadline).getTime()) return game;

  const loser = game.currentTurn as Color;
  const winner = opponent(loser);
  const now = new Date();
  const [updated] = await db
    .update(games)
    .set({
      status: "finished",
      winner,
      termination: "forfeit_timeout",
      finishedAt: now,
      turnDeadline: null,
      updatedAt: now,
    })
    .where(and(eq(games.id, game.id), eq(games.status, "active")))
    .returning();

  if (updated) {
    await db.insert(auditEvents).values({
      id: makeId(),
      userId: loser === "WHITE" ? game.whitePlayerId : game.blackPlayerId,
      eventType: "game.forfeit_timeout",
      details: { gameId: game.id, loser, winner },
    });
    return updated;
  }
  return (await loadGame(game.id)) ?? game;
}

// Determine terminal result after a move has been applied to `next`.
function terminalAfterMove(
  mover: Color,
  next: GameState,
  positionKeys: string[],
  cobFlags: boolean[]
): { winner: string; termination: string } | null {
  if (isGameOver(next)) {
    const opp = opponent(mover);
    const oppCount = Object.values(next.checkers).filter((c) => c.color === opp).length;
    return {
      winner: mover,
      termination: oppCount === 0 ? "total_conversion" : "no_legal_moves",
    };
  }
  if (checkThreefoldRepetition(positionKeys)) {
    return { winner: "DRAW", termination: "threefold" };
  }
  if (checkFiftyMoveRule(cobFlags)) {
    return { winner: "DRAW", termination: "fifty_move" };
  }
  return null;
}

// Sweep all active games whose turn deadline has passed (cron backstop).
export async function sweepExpiredGames(): Promise<number> {
  const now = new Date();
  const expired = await db
    .select()
    .from(games)
    .where(and(eq(games.status, "active"), lt(games.turnDeadline, now)));
  let count = 0;
  for (const game of expired) {
    await maybeForfeit(game);
    count += 1;
  }
  return count;
}

// --- router ----------------------------------------------------------------

export const gameRoutes = new Hono<{ Variables: AppVariables }>();

// All game routes require authentication.
gameRoutes.use("*", requireAuth);

// Create a new game (creator waits for an opponent).
gameRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const userId = c.get("userId")!;
  const { name, visibility, color } = c.req.valid("json");

  const creatorColor: Color =
    color === "random" ? (Math.random() < 0.5 ? "WHITE" : "BLACK") : color;

  const initial = initialGameState();
  const base = {
    name,
    visibility,
    createdBy: userId,
    whitePlayerId: creatorColor === "WHITE" ? userId : null,
    blackPlayerId: creatorColor === "BLACK" ? userId : null,
    currentTurn: "WHITE" as const,
    boardState: initial,
    positionKeys: [canonicalKey(initial)],
    cobMovedFlags: [] as boolean[],
    status: "waiting" as const,
  };

  let created: GameRow | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      const [row] = await db
        .insert(games)
        .values({ id: makeId(), joinCode: makeJoinCode(), ...base })
        .returning();
      created = row;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // retry only on join-code collision
    }
  }
  if (!created) return c.json({ error: "could-not-create-game" }, 500);

  return c.json({ game: await stateView(created, userId) }, 201);
});

// Public lobby: open games anyone can join.
gameRoutes.get("/open", async (c) => {
  const userId = c.get("userId")!;
  const rows = await db
    .select()
    .from(games)
    .where(and(eq(games.status, "waiting"), eq(games.visibility, "public")))
    .orderBy(desc(games.createdAt))
    .limit(50);

  const creatorIds = rows.map((r) => r.createdBy).filter(Boolean) as string[];
  const creators = creatorIds.length
    ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, creatorIds))
    : [];
  const nameById = new Map(creators.map((r) => [r.id, r.name]));

  const openGames = rows
    .filter((r) => r.createdBy !== userId) // don't list your own games as joinable
    .map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      createdBy: r.createdBy ? { id: r.createdBy, name: nameById.get(r.createdBy) ?? "Player" } : null,
      openColor: r.whitePlayerId ? "BLACK" : "WHITE",
    }));

  return c.json({ games: openGames });
});

// The current user's games (for Settings → Replays).
gameRoutes.get("/mine", async (c) => {
  const userId = c.get("userId")!;
  const rows = await db
    .select()
    .from(games)
    .where(
      or(
        eq(games.whitePlayerId, userId),
        eq(games.blackPlayerId, userId),
        eq(games.createdBy, userId)
      )
    )
    .orderBy(desc(games.updatedAt))
    .limit(200);

  const list = await Promise.all(
    rows.map(async (game) => {
      const players = await playerNames(game);
      return {
        id: game.id,
        name: game.name,
        status: game.status,
        visibility: game.visibility,
        winner: game.winner,
        termination: game.termination,
        moveCount: game.moveCount,
        yourColor: colorOf(game, userId),
        players,
        createdAt: game.createdAt,
        finishedAt: game.finishedAt,
      };
    })
  );
  return c.json({ games: list });
});

// Join a private game by its invite code.
gameRoutes.post("/join", zValidator("json", joinByCodeSchema), async (c) => {
  const userId = c.get("userId")!;
  const { code } = c.req.valid("json");
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.joinCode, code.toUpperCase()))
    .limit(1);
  if (!game) return c.json({ error: "game-not-found" }, 404);
  return doJoin(c, game, userId);
});

// Join a game by id (used by the public lobby).
gameRoutes.post("/:id/join", async (c) => {
  const userId = c.get("userId")!;
  const game = await loadGame(c.req.param("id"));
  if (!game) return c.json({ error: "game-not-found" }, 404);
  return doJoin(c, game, userId);
});

async function doJoin(
  c: Context<{ Variables: AppVariables }>,
  game: GameRow,
  userId: string
) {
  if (game.status !== "waiting") return c.json({ error: "game-not-joinable" }, 409);
  if (game.createdBy === userId || colorOf(game, userId)) {
    return c.json({ error: "already-in-game" }, 409);
  }

  const joinColor: Color = game.whitePlayerId ? "BLACK" : "WHITE";
  const now = new Date();
  const [updated] = await db
    .update(games)
    .set({
      whitePlayerId: joinColor === "WHITE" ? userId : game.whitePlayerId,
      blackPlayerId: joinColor === "BLACK" ? userId : game.blackPlayerId,
      status: "active",
      startedAt: now,
      lastMoveAt: now,
      turnDeadline: new Date(now.getTime() + TIMEOUT_MS),
      updatedAt: now,
    })
    .where(and(eq(games.id, game.id), eq(games.status, "waiting")))
    .returning();

  if (!updated) return c.json({ error: "game-not-joinable" }, 409);
  return c.json({ game: await stateView(updated, userId) });
}

// Poll target: authoritative game state (also lazily enforces forfeit).
gameRoutes.get("/:id/state", async (c) => {
  const userId = c.get("userId")!;
  let game = await loadGame(c.req.param("id"));
  if (!game) return c.json({ error: "game-not-found" }, 404);
  if (!isParticipant(game, userId)) return c.json({ error: "forbidden" }, 403);
  game = await maybeForfeit(game);
  return c.json({ game: await stateView(game, userId) });
});

// Submit a move.
gameRoutes.post("/:id/moves", zValidator("json", moveSchema), async (c) => {
  const userId = c.get("userId")!;
  const { from, to, ply } = c.req.valid("json");
  let game = await loadGame(c.req.param("id"));
  if (!game) return c.json({ error: "game-not-found" }, 404);

  const myColor = colorOf(game, userId);
  if (!myColor) return c.json({ error: "forbidden" }, 403);

  // Enforce the forfeit deadline before accepting anything.
  game = await maybeForfeit(game);
  if (game.status !== "active") {
    return c.json({ error: "game-over", game: await stateView(game, userId) }, 409);
  }
  // A retry of the caller's OWN last move is idempotent success.
  //
  // This has to come before the turn check: once your move lands it is no
  // longer your turn, so a resend — a phone on booth wifi that lost the
  // response, or a double tap — would otherwise be rejected as "not-your-turn".
  // `myColor !== currentTurn` is precisely "I was the last player to move".
  if (ply === game.moveCount - 1 && myColor !== game.currentTurn) {
    return c.json({ game: await stateView(game, userId) });
  }

  if (game.currentTurn !== myColor) {
    return c.json({ error: "not-your-turn", game: await stateView(game, userId) }, 409);
  }

  // Ordering: ply must match the current move count.
  if (ply !== game.moveCount) {
    return c.json({ error: "ply-conflict", game: await stateView(game, userId) }, 409);
  }

  const board = game.boardState as GameState;
  if (!isMoveLegal(board, from, to)) {
    return c.json({ error: "illegal-move", game: await stateView(game, userId) }, 422);
  }

  const next = applyMove(board, from, to);
  const newPositionKeys = [...(game.positionKeys as string[]), canonicalKey(next)];
  const newCobFlags = [...(game.cobMovedFlags as boolean[]), wasCobMove(board, from)];
  const newMoveCount = game.moveCount + 1;
  const terminal = terminalAfterMove(myColor, next, newPositionKeys, newCobFlags);
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(gameMoves).values({
        id: makeId(),
        gameId: game!.id,
        ply: game!.moveCount,
        color: myColor,
        fromVertex: from,
        toVertex: to,
      });
      await tx
        .update(games)
        .set({
          boardState: next,
          currentTurn: next.currentTurn,
          positionKeys: newPositionKeys,
          cobMovedFlags: newCobFlags,
          moveCount: newMoveCount,
          lastMoveAt: now,
          turnDeadline: terminal ? null : new Date(now.getTime() + TIMEOUT_MS),
          status: terminal ? "finished" : "active",
          winner: terminal ? terminal.winner : null,
          termination: terminal ? terminal.termination : null,
          finishedAt: terminal ? now : null,
          updatedAt: now,
        })
        .where(eq(games.id, game!.id));
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Concurrent duplicate of this ply — return the current authoritative state.
      const fresh = await loadGame(game.id);
      return c.json({ game: fresh ? await stateView(fresh, userId) : null });
    }
    throw err;
  }

  const updated = await loadGame(game.id);
  return c.json({ game: updated ? await stateView(updated, userId) : null });
});

// Resign the game.
gameRoutes.post("/:id/resign", async (c) => {
  const userId = c.get("userId")!;
  let game = await loadGame(c.req.param("id"));
  if (!game) return c.json({ error: "game-not-found" }, 404);
  const myColor = colorOf(game, userId);
  if (!myColor) return c.json({ error: "forbidden" }, 403);

  game = await maybeForfeit(game);
  if (game.status !== "active") {
    return c.json({ error: "game-over", game: await stateView(game, userId) }, 409);
  }

  const now = new Date();
  const [updated] = await db
    .update(games)
    .set({
      status: "finished",
      winner: opponent(myColor),
      termination: "resign",
      finishedAt: now,
      turnDeadline: null,
      updatedAt: now,
    })
    .where(and(eq(games.id, game.id), eq(games.status, "active")))
    .returning();

  await db.insert(auditEvents).values({
    id: makeId(),
    userId,
    eventType: "game.resign",
    details: { gameId: game.id, color: myColor },
  });

  return c.json({ game: await stateView(updated ?? game, userId) });
});

// Abort a still-waiting game (creator only).
gameRoutes.post("/:id/abort", async (c) => {
  const userId = c.get("userId")!;
  const game = await loadGame(c.req.param("id"));
  if (!game) return c.json({ error: "game-not-found" }, 404);
  if (game.createdBy !== userId) return c.json({ error: "forbidden" }, 403);
  if (game.status !== "waiting") return c.json({ error: "not-abortable" }, 409);

  const now = new Date();
  const [updated] = await db
    .update(games)
    .set({ status: "aborted", finishedAt: now, updatedAt: now })
    .where(and(eq(games.id, game.id), eq(games.status, "waiting")))
    .returning();

  return c.json({ game: await stateView(updated ?? game, userId) });
});

// Full replay (participants only).
gameRoutes.get("/:id/replay", async (c) => {
  const userId = c.get("userId")!;
  const game = await loadGame(c.req.param("id"));
  if (!game) return c.json({ error: "game-not-found" }, 404);
  if (!isParticipant(game, userId)) return c.json({ error: "forbidden" }, 403);

  const moves = await db
    .select({
      ply: gameMoves.ply,
      color: gameMoves.color,
      from: gameMoves.fromVertex,
      to: gameMoves.toVertex,
      createdAt: gameMoves.createdAt,
    })
    .from(gameMoves)
    .where(eq(gameMoves.gameId, game.id))
    .orderBy(gameMoves.ply);

  const players = await playerNames(game);
  return c.json({
    game: {
      id: game.id,
      name: game.name,
      status: game.status,
      winner: game.winner,
      termination: game.termination,
      moveCount: game.moveCount,
      players,
      yourColor: colorOf(game, userId),
      createdAt: game.createdAt,
      finishedAt: game.finishedAt,
    },
    // Standard opening; replay by feeding these [from,to] pairs through the engine.
    start: initialGameState(),
    moves,
  });
});
