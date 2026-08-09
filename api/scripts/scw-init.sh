#!/usr/bin/env bash
set -euo pipefail

REGION="${SCW_REGION:-nl-ams}"
NAMESPACE_NAME="${SCW_FUNCTION_NAMESPACE:-tarati-cloud-functions}"
FUNCTION_NAME="${SCW_FUNCTION_NAME:-tarati-api-prd}"
RUNTIME="${SCW_FUNCTION_RUNTIME:-node22}"
HANDLER="${SCW_FUNCTION_HANDLER:-dist/index.handle}"

if ! scw info >/dev/null 2>&1; then
  echo "Scaleway CLI is not logged in. Run: scw login"
  exit 1
fi

NS_ID="$(scw function namespace list region="${REGION}" -o json | jq -r ".[] | select(.name==\"${NAMESPACE_NAME}\") | .id" | head -n1)"
if [ -z "${NS_ID}" ] || [ "${NS_ID}" = "null" ]; then
  NS_ID="$(scw function namespace create name="${NAMESPACE_NAME}" region="${REGION}" -o json | jq -r .id)"
fi

FN_ID="$(scw function function list region="${REGION}" -o json | jq -r ".[] | select(.name==\"${FUNCTION_NAME}\") | .id" | head -n1)"
if [ -z "${FN_ID}" ] || [ "${FN_ID}" = "null" ]; then
  scw function function create \
    name="${FUNCTION_NAME}" \
    namespace-id="${NS_ID}" \
    runtime="${RUNTIME}" \
    handler="${HANDLER}" \
    privacy="public" \
    http-option="enabled" \
    sandbox="v2" \
    memory-limit="${SCW_FUNCTION_MEMORY:-1024}" \
    min-scale="${SCW_FUNCTION_MIN_SCALE:-1}" \
    max-scale="${SCW_FUNCTION_MAX_SCALE:-10}" \
    timeout="${SCW_FUNCTION_TIMEOUT:-60s}" \
    private-network-id="${SCW_PRIVATE_NETWORK_ID:?set SCW_PRIVATE_NETWORK_ID — the managed Postgres has no public endpoint, so a function without it cannot reach the DB}" \
    region="${REGION}" -o human
else
  echo "Function ${FUNCTION_NAME} already exists."
fi

echo "Scaleway function bootstrap complete."
