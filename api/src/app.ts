import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { auth } from "./auth.js";
import { db } from "./db/client.js";
import { account, auditEvents, gameMoves, games, session, user } from "./db/schema.js";
import { env } from "./env.js";
import { makeId } from "./lib/id.js";
import { requireAuth, type AppVariables } from "./lib/http.js";
import { gameRoutes, sweepExpiredGames } from "./routes/games.js";
import { spectateRoutes } from "./routes/spectate.js";

const deleteAccountSchema = z.object({
  confirmText: z.literal("DELETE"),
});

export const app = new Hono<{ Variables: AppVariables }>();

app.use(
  "/api/*",
  cors({
    origin: env.CORS_ORIGIN ?? env.BETTER_AUTH_TRUSTED_ORIGIN ?? env.BETTER_AUTH_BASE_URL,
    credentials: true,
  })
);

// The SPA reaches this API through its own origin's /api/* proxy, so responses
// pass through a CDN. Nothing here is ever cacheable, and a cached Set-Cookie
// would hand one visitor another's session.
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, private");
  c.header("Vary", "Cookie"); // the CORS middleware already adds Origin
});

app.use("/api/*", async (c, next) => {
  // Better Auth needs the raw request stream intact for its own handlers.
  // Spectator routes are public, and the projector polls all day — no point
  // paying a session lookup per request for a viewer that never signs in.
  if (
    c.req.path.startsWith("/api/auth/") ||
    c.req.path.startsWith("/api/v1/spectate/")
  ) {
    c.set("userId", null);
    await next();
    return;
  }
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("userId", sessionData?.user?.id ?? null);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/v1/me", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ user: null }, 401);
  const rows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  return c.json({ user: rows[0] ?? null });
});

// Multiplayer + replay routes.
app.route("/api/v1/games", gameRoutes);
app.route("/api/v1/spectate", spectateRoutes);

// GDPR: export everything tied to the account.
app.get("/api/v1/account/export", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const [profile] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  const myGames = await db
    .select()
    .from(games)
    .where(
      or(
        eq(games.whitePlayerId, userId),
        eq(games.blackPlayerId, userId),
        eq(games.createdBy, userId)
      )
    );
  const gameIds = myGames.map((g) => g.id);
  const myMoves = gameIds.length
    ? await db.select().from(gameMoves).where(inArray(gameMoves.gameId, gameIds))
    : [];

  return c.json({
    exportedAt: new Date().toISOString(),
    profile,
    games: myGames,
    moves: myMoves,
  });
});

// GDPR: delete the account. Player references on shared games are auto-nulled
// by the ON DELETE SET NULL foreign keys, preserving the opponent's replay.
app.post(
  "/api/v1/account/delete",
  requireAuth,
  zValidator("json", deleteAccountSchema),
  async (c) => {
    const userId = c.get("userId")!;

    await db.transaction(async (tx) => {
      await tx.insert(auditEvents).values({
        id: makeId(),
        userId,
        eventType: "account.delete_requested",
        details: { source: "self_service" },
      });
      await tx.delete(account).where(eq(account.userId, userId));
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(user).where(eq(user.id, userId));
    });

    return c.json({ ok: true });
  }
);

// Cron backstop: finalise games whose forfeit deadline passed while nobody was
// polling. Guarded by a shared secret; wire a Scaleway cron trigger to this.
app.post("/api/v1/internal/games/sweep-timeouts", async (c) => {
  const secret = c.req.header("x-cron-secret");
  if (!env.CRON_SWEEP_SECRET || secret !== env.CRON_SWEEP_SECRET) {
    return c.json({ error: "forbidden" }, 403);
  }
  const swept = await sweepExpiredGames();
  return c.json({ ok: true, swept });
});
