import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth tables (user / session / account / verification)
// Kept identical to the Better Auth Drizzle adapter's expected shape.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId),
  ]
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Multiplayer game tables
// ---------------------------------------------------------------------------

// The canonical game state stored on the game row (mirrors the client shape).
type GameStateJson = {
  checkers: Record<string, { color: string; isUpgraded: boolean }>;
  currentTurn: string;
};

export const games = pgTable(
  "games",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // waiting | active | finished | aborted
    status: text("status").notNull().default("waiting"),
    // private | public
    visibility: text("visibility").notNull().default("private"),
    joinCode: text("join_code").notNull().unique(),

    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    // Player columns are set null (not cascade) so deleting one account preserves
    // the opponent's replay; the deleted user simply resolves to "Deleted player".
    whitePlayerId: text("white_player_id").references(() => user.id, { onDelete: "set null" }),
    blackPlayerId: text("black_player_id").references(() => user.id, { onDelete: "set null" }),

    currentTurn: text("current_turn").notNull().default("WHITE"),
    // Authoritative live position snapshot ({ checkers, currentTurn }).
    boardState: jsonb("board_state").$type<GameStateJson>().notNull(),
    // Canonical position-string keys (for threefold repetition; language-agnostic).
    positionKeys: jsonb("position_keys").$type<string[]>().notNull().default([]),
    // Boolean[] parallel to moves: did a cob move/promote (for the 50-move rule)?
    cobMovedFlags: jsonb("cob_moved_flags").$type<boolean[]>().notNull().default([]),

    moveCount: integer("move_count").notNull().default(0),
    lastMoveAt: timestamp("last_move_at", { withTimezone: true }),
    turnDeadline: timestamp("turn_deadline", { withTimezone: true }),

    // WHITE | BLACK | DRAW | null
    winner: text("winner"),
    // no_legal_moves | total_conversion | threefold | fifty_move | forfeit_timeout | resign | aborted | null
    termination: text("termination"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("games_status_idx").on(table.status),
    index("games_visibility_status_idx").on(table.visibility, table.status),
    index("games_white_player_idx").on(table.whitePlayerId),
    index("games_black_player_idx").on(table.blackPlayerId),
    index("games_created_by_idx").on(table.createdBy),
  ]
);

export const gameMoves = pgTable(
  "game_moves",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    ply: integer("ply").notNull(),
    color: text("color").notNull(),
    fromVertex: text("from_vertex").notNull(),
    toVertex: text("to_vertex").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("game_moves_game_id_idx").on(table.gameId),
    uniqueIndex("game_moves_game_ply_unique").on(table.gameId, table.ply),
  ]
);

// ---------------------------------------------------------------------------
// Audit trail (GDPR delete requests, forfeits, resignations)
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_user_id_idx").on(table.userId)]
);
