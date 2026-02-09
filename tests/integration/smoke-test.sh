#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3500}"

echo "=== Integration Smoke Test ==="

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [[ "$status" == "200" ]]; then
	echo "GET / ... PASS"
else
	echo "GET / ... FAIL ($status)"
fi

"$(dirname "$0")/../api/curl-tests.sh"

echo "Smoke tests completed."
