import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "../env.js";
import * as schema from "./schema.js";

const connectionString = resolveDatabaseUrl();
if (!connectionString) {
  throw new Error("Missing database URL. Set DATABASE_URL or DATABASE_URL_DEV/PRD.");
}

const pool = new Pool({
  connectionString,
  // A Scaleway Function instance serves few concurrent requests, so a large
  // pool buys nothing and eats the shared instance's 100-connection budget
  // (rdb-blvckstudios-main is shared with derivium + qquill). Worst case here:
  // max_scale (10) x max (3) = 30.
  max: Number(process.env.PGPOOL_MAX ?? 3),
  idleTimeoutMillis: 10_000,
  // Fail fast rather than hanging until the function timeout.
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  keepAlive: true,
  application_name: "tarati-api",
});

// Without this listener, an error on an IDLE client (DB failover, VPC blip,
// instance frozen between invocations) is an unhandled 'error' event and takes
// the whole process down. pg re-creates the connection on the next checkout.
pool.on("error", (err) => {
  console.error("[pg] idle client error:", err);
});

export const db = drizzle(pool, { schema });
