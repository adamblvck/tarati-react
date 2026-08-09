#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_ROOT="$(cd "${API_ROOT}/.." && pwd)"

# The app's Scaleway TEM credential shares a name with the Scaleway CLI's own
# auth variable. An EMPTY value here overrides the CLI profile and makes every
# scw call fail with "secret key cannot be empty", so drop it when unset.
if [ -z "${SCW_SECRET_KEY:-}" ]; then unset SCW_SECRET_KEY || true; fi

REGION="${SCW_REGION:-nl-ams}"
NAMESPACE_NAME="${SCW_FUNCTION_NAMESPACE:-tarati-cloud-functions}"
FUNCTION_NAME="${SCW_FUNCTION_NAME:-tarati-api-prd}"
RUNTIME="${SCW_FUNCTION_RUNTIME:-node22}"
ZIP_NAME="${SCW_ZIP_NAME:-tarati-api-prd.zip}"
BUILD_DIR="${API_ROOT}/.scw-build"

# Load prod env when run directly (run-deploy-with-env.sh also sources it).
if [ -f "${APP_ROOT}/.env.prod" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${APP_ROOT}/.env.prod"
  set +a
fi

NS_ID="$(scw function namespace list region="${REGION}" -o json | jq -r ".[] | select(.name==\"${NAMESPACE_NAME}\") | .id" | head -n1)"
if [ -z "${NS_ID}" ] || [ "${NS_ID}" = "null" ]; then
  echo "Could not resolve namespace id for ${NAMESPACE_NAME} in ${REGION}."
  echo "Run ./api/scripts/scw-init.sh first or set SCW_FUNCTION_NAMESPACE."
  exit 1
fi

rm -rf "${BUILD_DIR}" "${API_ROOT}/${ZIP_NAME}"
mkdir -p "${BUILD_DIR}"

# Build (prebuild syncs the vendored engine, then tsc emits dist/).
npm --prefix "${API_ROOT}" run build
cp -r "${API_ROOT}/dist" "${API_ROOT}/package.json" "${BUILD_DIR}/"

(
  cd "${BUILD_DIR}"
  npm install --omit=dev --omit=optional --package-lock=false
  zip -qr "${API_ROOT}/${ZIP_NAME}" .
)

scw function deploy \
  namespace-id="${NS_ID}" \
  name="${FUNCTION_NAME}" \
  runtime="${RUNTIME}" \
  zip-file="${API_ROOT}/${ZIP_NAME}" \
  region="${REGION}" -o human

FN_ID="$(scw function function list region="${REGION}" -o json | jq -r ".[] | select(.name==\"${FUNCTION_NAME}\" and .namespace_id == \"${NS_ID}\") | .id" | head -n1)"
if [ -z "${FN_ID}" ] || [ "${FN_ID}" = "null" ]; then
  echo "Could not resolve function id for ${FUNCTION_NAME}. Skipping env update."
  exit 0
fi

# Non-secret runtime vars injected here. Secrets (BETTER_AUTH_SECRET,
# GOOGLE_CLIENT_SECRET, DATABASE_URL, SCW_SECRET_KEY, CRON_SWEEP_SECRET) are
# managed manually in the Scaleway console and are NOT touched by this script.
declare -a normal_args=()
for key in NODE_ENV API_PORT CORS_ORIGIN BETTER_AUTH_BASE_URL BETTER_AUTH_TRUSTED_ORIGIN APP_BASE_URL \
           GOOGLE_CLIENT_ID TEM_FROM_EMAIL TEM_FROM_NAME TURN_TIMEOUT_SECONDS \
           SPECTATOR_MODE PGPOOL_MAX SCW_SINGLE_SET_COOKIE; do
  value="${!key-}"
  # Scaleway reserves the SCW_ prefix for platform-injected variables and
  # rejects the whole update if one is present. TEM's region has a default in
  # env.ts, so dropping it here is harmless.
  case "${key}" in SCW_*|PORT) continue ;; esac
  if [ -n "${value}" ]; then
    normal_args+=("environment-variables.${key}=${value}")
  fi
done

if [ "${#normal_args[@]}" -gt 0 ]; then
  scw function function update "${FN_ID}" \
    region="${REGION}" \
    "${normal_args[@]}" \
    -o human
fi

echo "Deployment complete."
