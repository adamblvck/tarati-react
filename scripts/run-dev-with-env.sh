#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${APP_ROOT}/.env.dev"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}. Create it (you can copy .env.example)."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

# In dev the CRA dev server proxies /api -> localhost:API_PORT, so the client
# talks to the API on the same origin (cookies "just work"). Force empty base.
export REACT_APP_API_BASE_URL=""
# Don't auto-open a browser tab from react-scripts under concurrently.
export BROWSER="${BROWSER:-none}"

# Derive a localhost tunnel DB URL from PG creds when DATABASE_URL isn't set.
if [ -z "${DATABASE_URL-}" ] && [ -n "${PGUSER-}" ] && [ -n "${PGPASSWORD-}" ]; then
  LOCAL_DB_NAME="${LOCAL_DB_NAME:-tarati_dev}"
  LOCAL_DB_PORT="${LOCAL_DB_TUNNEL_PORT:-5432}"
  export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@localhost:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}"
fi

cd "${APP_ROOT}"
exec npx concurrently -k -n WEB,API,TUNNEL \
  "npm start" \
  "npm run api:dev" \
  "npm run api:tunnel"
