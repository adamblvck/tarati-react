# Tarati API

Serverless backend for Tarati online multiplayer + accounts. Built with
**Hono + Better Auth + Drizzle + `pg`**, deployed as a single **Scaleway
Function** (`node20`, `nl-ams`), talking to the shared PostgreSQL instance over
an SSH bastion tunnel. Mirrors the Derivium API architecture.

## What it does

- Email/password + Google auth, password reset & email verification (Scaleway TEM).
- Multiplayer games: create (private invite code or public lobby), join, play.
- **Server-authoritative** move validation using the same rules engine as the
  client (vendored into `src/lib/engine/`, drift-guarded against the parity fixture).
- 60-second per-turn forfeit, enforced lazily on state polls + a cron backstop.
- Replays (move list per game) and GDPR export/delete.

## Layout

```
src/
  app.ts          Hono app: CORS, session mw, auth handler, health, me, account export/delete, cron sweep
  index.ts        Scaleway Function handler (dist/index.handle)
  dev-server.ts   Local @hono/node-server
  auth.ts         Better Auth (email/pass, Google, reset + verification via TEM)
  env.ts          Zod-validated env + resolveDatabaseUrl()
  db/{client,schema}.ts
  lib/{id,http,mailer,engine}.ts + lib/engine/*  (vendored pure engine)
  routes/games.ts Multiplayer + replay endpoints
drizzle/          Generated migrations
sql/              Hand-run role + grant scripts (see sql/README.md)
scripts/          start-db-tunnel.sh, scw-init.sh, scw-deploy.sh, sync-engine.mjs
```

## Local development

From the **tarati-react** root:

1. `cp .env.example .env.dev` and fill in values (DB, bastion, auth secret; TEM
   optional — reset/verify emails are logged to the console when unset).
2. Create the DB + roles once (admin): follow [`api/sql/README.md`](sql/README.md).
3. Apply the schema:
   ```bash
   npm run api:tunnel        # terminal 1 — opens localhost:5432 → DB via bastion
   npm run api:db:migrate    # terminal 2 — applies drizzle/*.sql
   ```
4. Run everything (web + API + tunnel):
   ```bash
   npm run dev
   ```
   CRA on http://localhost:3000 (proxies `/api` → the API on :8787).

`npm run api:test` runs the engine drift guard (vendored engine vs the 380-case
parity fixture). The vendored engine re-syncs automatically on build/test; run
`npm --prefix api run engine:sync` after editing `src/GameBoard.js`/`src/AI.js`.

## Manual external setup (needs your credentials)

These can't be scripted with your secrets and are done once:

- **Databases & roles** — `CREATE DATABASE tarati_dev/tarati_prd`, then run
  `sql/*.sql` (see sql/README.md). Put the role passwords in `DATABASE_URL_*`.
- **Google OAuth** — create a *Web application* client. Authorized redirect URI:
  `<BETTER_AUTH_BASE_URL>/api/auth/callback/google` (prod
  `https://api.tarati.blvckstudios.com/...`, dev `http://localhost:8787/...` and
  `http://localhost:3000/...`). Set `GOOGLE_CLIENT_ID/SECRET`.
- **Scaleway TEM** — verify a sender domain (SPF/DKIM), then set `SCW_SECRET_KEY`,
  `SCW_PROJECT_ID`, `TEM_FROM_EMAIL`.
- **Scaleway function secrets** — set as *secret* env vars in the console (never
  in the deploy script): `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`,
  `DATABASE_URL` (→ tarati_prd), `SCW_SECRET_KEY`, `CRON_SWEEP_SECRET`.
- **Forfeit cron** — add a Scaleway cron trigger on the function that POSTs to
  `/api/v1/internal/games/sweep-timeouts` every minute with header
  `x-cron-secret: <CRON_SWEEP_SECRET>`.

## Deploy

```bash
npm run deploy:api        # loads .env.prod → api/scripts/scw-deploy.sh
```

First time only: `bash api/scripts/scw-init.sh` (creates the namespace +
function). The deploy script builds, zips `dist` + prod deps, deploys to
`nl-ams`, and injects the non-secret env vars.

## Endpoints

`GET /api/health` · `GET|POST /api/auth/*` · `GET /api/v1/me` ·
`GET /api/v1/account/export` · `POST /api/v1/account/delete` ·
`POST /api/v1/games` · `GET /api/v1/games/open` · `GET /api/v1/games/mine` ·
`POST /api/v1/games/join` · `POST /api/v1/games/:id/join` ·
`GET /api/v1/games/:id/state` · `POST /api/v1/games/:id/moves` ·
`POST /api/v1/games/:id/resign` · `POST /api/v1/games/:id/abort` ·
`GET /api/v1/games/:id/replay` · `POST /api/v1/internal/games/sweep-timeouts`

## Integration tests

End-to-end tests against a running API and a real database. Skipped entirely
when `TARATI_API_URL` is unset, so `npm run api:test` stays a fast, DB-free
engine drift guard.

```bash
# against local dev (tunnel + npm run dev must be up)
TARATI_API_URL=http://localhost:8787 TARATI_ORIGIN=http://localhost:3000 \
  npm --prefix api run test:integration

# against production, through the Netlify /api/* proxy (the full real path)
TARATI_API_URL=https://tarati.blvckstudios.com npm --prefix api run test:integration

# for repeated back-to-back runs, go straight to the function
TARATI_API_URL=https://<fn>.functions.fnc.nl-ams.scw.cloud \
  TARATI_ORIGIN=https://tarati.blvckstudios.com \
  npm --prefix api run test:integration
```

The suite fires several hundred unpaced requests in under a minute. Netlify's
edge answers that burst with a 403 HTML page, which surfaces as a wave of
"returned non-JSON (403)" failures — hence the third form above. Real traffic
does not reproduce it: sustained 11 req/s through the proxy (roughly 40 players
polling every 2.5s) measured completely clean.

Test accounts are `dev-a`/`dev-b`/`dev-c@example.com`, created idempotently, so
the suite is re-runnable forever. Teardown aborts or resigns every game it
created; nothing is left live in the lobby.

## Event operations

The function runs **unprovisioned** (`min-scale=0`): nothing is billed while
nobody is playing, and Scaleway starts an instance on the first request. The
cost is a cold start on that first request — measured at 8–10s — so warm it
before an audience arrives rather than during.

`FN_ID=7da16d06-30f9-41ae-8c6c-e2f485d6ed91`, region `nl-ams`.

```bash
# 1. Minimum viable warm-up. One instance removes the cold start entirely for
#    the first visitor, and is the smallest thing worth paying for.
scw function function update $FN_ID region=nl-ams min-scale=1

# 2. A busy booth. Bursts still spawn cold instances beyond min-scale, and a
#    cold one answers slowly, so raise the floor if a queue forms.
scw function function update $FN_ID region=nl-ams min-scale=3 memory-limit=2048

# 3. Back to zero afterwards. min-scale keeps instances alive and billing —
#    at 5 x 2GB that is roughly EUR 10/day, so this is not optional.
scw function function update $FN_ID region=nl-ams min-scale=0 max-scale=10 memory-limit=1024

# Check what is actually set
scw function function get $FN_ID region=nl-ams -o json \
  | jq -c '{status, min_scale, max_scale, memory_limit, cpu_limit}'

# Poke it once so the first real visitor does not pay the cold start
curl -s https://tarati.blvckstudios.com/api/health
```

Measured, so you can size this against real numbers rather than guessing:

| | |
|---|---|
| cold start (unprovisioned) | 8–10 s on the first request |
| warm poll (`/games/:id/state`) | p50 0.36 s at 40 concurrent |
| sustained load through the proxy | 11 req/s (~40 players) completely clean |
| pool ceiling | `max-scale` x `PGPOOL_MAX` — keep the product under ~40 |

Clearing games both players walked away from (the `/watch` wall also does this
by itself every 30s while anyone is watching):

```bash
curl -X POST https://tarati.blvckstudios.com/api/v1/internal/games/sweep-timeouts \
     -H "x-cron-secret: $CRON_SWEEP_SECRET"
```

`TURN_TIMEOUT_SECONDS`, `PGPOOL_MAX` and `SPECTATOR_MODE` are plain environment
variables, so all three change live from the console without a rebuild.
