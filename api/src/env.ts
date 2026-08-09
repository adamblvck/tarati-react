import { z } from "zod";

// `set -a; . .env.dev` exports blank placeholders as EMPTY STRINGS, and
// .env.example ships several of those deliberately (Google, TEM). A bare
// `.optional()` accepts undefined but rejects "", which would make a
// correctly-filled-in env file fail to boot. Treat blank as "not set".
const blankAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema);

const optionalText = () => blankAsUndefined(z.string().min(1).optional());
const optionalUrl = () => blankAsUndefined(z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(8787),

  // Database (one of DATABASE_URL, or the per-env pair)
  DATABASE_URL: optionalText(),
  DATABASE_URL_DEV: optionalText(),
  DATABASE_URL_PRD: optionalText(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_BASE_URL: z.string().url(),
  BETTER_AUTH_TRUSTED_ORIGIN: optionalUrl(),
  CORS_ORIGIN: optionalUrl(),
  // Frontend origin — used to build email links + post-verification redirects.
  APP_BASE_URL: optionalUrl(),

  // Google OAuth (optional; social login enabled only when both present)
  GOOGLE_CLIENT_ID: optionalText(),
  GOOGLE_CLIENT_SECRET: optionalText(),

  // Scaleway Transactional Email (TEM) — for password reset + verification
  SCW_SECRET_KEY: optionalText(),
  SCW_PROJECT_ID: optionalText(),
  SCW_TEM_REGION: blankAsUndefined(z.string().default("fr-par")),
  TEM_FROM_EMAIL: blankAsUndefined(z.string().email().optional()),
  TEM_FROM_NAME: blankAsUndefined(z.string().default("Tarati")),

  // Multiplayer
  // Per-turn forfeit window in seconds (a player who doesn't move in time forfeits).
  TURN_TIMEOUT_SECONDS: z.coerce.number().default(60),
  // Shared secret guarding the cron timeout-sweep endpoint.
  CRON_SWEEP_SECRET: optionalText(),
  // Unauthenticated read-only game views, for a projector at an event.
  SPECTATOR_MODE: blankAsUndefined(
    z.enum(["true", "false"]).default("false")
  ).transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid API environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;

export function resolveDatabaseUrl() {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  return env.NODE_ENV === "production" ? env.DATABASE_URL_PRD : env.DATABASE_URL_DEV;
}
