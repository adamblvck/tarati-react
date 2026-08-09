#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_ROOT="$(cd "${API_ROOT}/.." && pwd)" # tarati-react

# Load env files in sequence so later files can fill missing keys.
# Put BASTION_* and PG* credentials in tarati-react/.env.dev (see .env.example).
for candidate in "${APP_ROOT}/.env" "${APP_ROOT}/.env.dev" "${API_ROOT}/.env" "${EXTRA_ENV_FILE:-}"; do
  if [ -n "${candidate}" ] && [ -f "${candidate}" ]; then
    set -a
    # shellcheck disable=SC1090
    . "${candidate}"
    set +a
  fi
done

if [ -z "${BASTION_USERNAME-}" ] || [ -z "${BASTION_HOST-}" ] || [ -z "${PGHOST-}" ] || [ -z "${PGPORT-}" ]; then
  echo "Missing bastion/postgres env vars. Expected BASTION_USERNAME, BASTION_HOST, PGHOST, PGPORT."
  echo "Set them in ${APP_ROOT}/.env.dev (or point EXTRA_ENV_FILE at a file that has them)."
  exit 1
fi

BASTION_KEY="${BASTION_KEY_PATH:-$HOME/.ssh/Scaleway_BLVCKSTUDIOS_DB_Bastion}"
LOCAL_PORT="${LOCAL_DB_TUNNEL_PORT:-5432}"

if ! [ -f "${BASTION_KEY}" ]; then
  echo "SSH key not found at ${BASTION_KEY}. Set BASTION_KEY_PATH if it lives elsewhere."
  exit 1
fi

if lsof -ti tcp:"${LOCAL_PORT}" >/dev/null 2>&1; then
  echo "Local tunnel port ${LOCAL_PORT} is already in use. Reusing existing process."
  while true; do sleep 3600; done
fi

cleanup() {
  if [ -n "${SSH_TUNNEL_PID-}" ] && kill -0 "${SSH_TUNNEL_PID}" 2>/dev/null; then
    kill "${SSH_TUNNEL_PID}" || true
  fi
}

trap cleanup EXIT SIGINT SIGTERM

echo "Opening PostgreSQL SSH tunnel on localhost:${LOCAL_PORT}..."
ssh -o StrictHostKeyChecking=no -i "${BASTION_KEY}" -N -L "${LOCAL_PORT}:${PGHOST}:${PGPORT}" "${BASTION_USERNAME}@${BASTION_HOST}" &
SSH_TUNNEL_PID=$!

sleep 2
if ! kill -0 "${SSH_TUNNEL_PID}" 2>/dev/null; then
  echo "Failed to start SSH tunnel."
  exit 1
fi

echo "Tunnel active. Press Ctrl+C to stop."
wait "${SSH_TUNNEL_PID}"
