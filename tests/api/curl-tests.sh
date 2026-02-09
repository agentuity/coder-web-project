#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3500}"

pass() { echo "PASS"; }
fail() { echo "FAIL ($1)"; }

check_status() {
	local method="$1"
	local path="$2"
	local expected="$3"
	local data="${4:-}"
	local url="${BASE_URL}${path}"
	local status
	if [[ -n "$data" ]]; then
		status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
	else
		status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
	fi
	if [[ "$status" == "$expected" ]]; then
		printf "%s %s... " "$method" "$path"; pass
	else
		printf "%s %s... " "$method" "$path"; fail "$status"
	fi
}

echo "=== API Test Suite ==="

# Public endpoints
check_status GET "/api/auth-methods" 200

# Auth-protected endpoints should return 401
check_status GET "/api/me" 401
check_status GET "/api/workspaces" 401
check_status POST "/api/workspaces" 401 '{"name":"Demo"}'
check_status GET "/api/workspaces/fake-id" 401
check_status PATCH "/api/workspaces/fake-id" 401 '{"name":"Updated"}'
check_status DELETE "/api/workspaces/fake-id" 401

check_status GET "/api/workspaces/fake-wid/sessions" 401
check_status POST "/api/workspaces/fake-wid/sessions" 401 '{"prompt":"Hello"}'

check_status GET "/api/sessions/fake-id" 401
check_status PATCH "/api/sessions/fake-id" 401 '{"title":"New"}'
check_status POST "/api/sessions/fake-id/retry" 401
check_status POST "/api/sessions/fake-id/fork" 401
check_status DELETE "/api/sessions/fake-id" 401

check_status GET "/api/sessions/fake-id/messages" 401
check_status POST "/api/sessions/fake-id/messages" 401 '{"text":"Hi"}'
check_status GET "/api/sessions/fake-id/events" 401
check_status POST "/api/sessions/fake-id/abort" 401
check_status GET "/api/sessions/fake-id/diff" 401
check_status POST "/api/sessions/fake-id/permissions/fake-req" 401 '{"reply":"once"}'
check_status POST "/api/sessions/fake-id/questions/fake-req" 401 '{"answers":[["a"]]}'
check_status GET "/api/sessions/fake-id/files" 401
check_status GET "/api/sessions/fake-id/files/content" 401
check_status GET "/api/sessions/fake-id/terminal" 401

check_status GET "/api/workspaces/fake-wid/skills" 401
check_status POST "/api/workspaces/fake-wid/skills" 401 '{"name":"Skill","content":"# Skill"}'
check_status PATCH "/api/skills/fake-id" 401 '{"enabled":false}'
check_status DELETE "/api/skills/fake-id" 401

check_status GET "/api/workspaces/fake-wid/sources" 401
check_status POST "/api/workspaces/fake-wid/sources" 401 '{"name":"Src","type":"local","config":{}}'
check_status PATCH "/api/sources/fake-id" 401 '{"enabled":false}'
check_status DELETE "/api/sources/fake-id" 401

# 404 check
check_status GET "/api/does-not-exist" 404
