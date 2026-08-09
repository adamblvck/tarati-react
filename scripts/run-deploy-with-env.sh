#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${APP_ROOT}/.env.prod"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}. Create it before deploying."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

cd "${APP_ROOT}"
exec bash ./api/scripts/scw-deploy.sh
