#!/usr/bin/env bash
set -euo pipefail

# Runs a drizzle-kit command (generate | migrate | push | studio) with the API
# env loaded from .env.dev. `migrate`/`push`/`studio` also need the tunnel up
# (npm run api:tunnel in another terminal).

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${APP_ROOT}/.env.dev"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

# Derive a localhost tunnel DB URL from PG creds when DATABASE_URL isn't set.
if [ -z "${DATABASE_URL-}" ] && [ -n "${PGUSER-}" ] && [ -n "${PGPASSWORD-}" ]; then
  LOCAL_DB_NAME="${LOCAL_DB_NAME:-tarati_dev}"
  LOCAL_DB_PORT="${LOCAL_DB_TUNNEL_PORT:-5432}"
  export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@localhost:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}"
fi

exec npm --prefix "${APP_ROOT}/api" run "db:${1:?usage: run-db-with-env.sh <generate|migrate|push|studio>}"
