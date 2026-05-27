#!/usr/bin/env bash
# Weryfikacja kontraktu API zgodnego z Flutter (wymaga działającego serwera + seed).
set -euo pipefail

BASE="${API_BASE:-http://localhost:3000/api}"
EMAIL="${TEST_EMAIL:-anna@coparentes.app}"
PASSWORD="${TEST_PASSWORD:-Coparentes!123}"

if [ "${E2E_REGISTER_JOIN:-}" = "true" ]; then
  echo "==> POST /auth/register"
  SUFFIX=$(date +%s)
  EMAIL_A="e2e-a-${SUFFIX}@test.coparentes.app"
  EMAIL_B="e2e-b-${SUFFIX}@test.coparentes.app"
  REG=$(curl -sf -X POST "$BASE/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"E2E A\",\"email\":\"$EMAIL_A\",\"password\":\"$PASSWORD\",\"workspaceName\":\"E2E WS\"}")
  TOKEN=$(echo "$REG" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.token) process.exit(1); console.log(j.token)")
  INVITE=$(echo "$REG" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.workspace?.inviteCode) process.exit(1); console.log(j.workspace.inviteCode)")
  echo "    OK register + inviteCode"
  echo "==> POST /auth/join"
  JOIN=$(curl -sf -X POST "$BASE/auth/join" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"E2E B\",\"email\":\"$EMAIL_B\",\"password\":\"$PASSWORD\",\"inviteCode\":\"$INVITE\",\"role\":\"parentB\"}")
  echo "$JOIN" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(j.user?.role!=='parentB') process.exit(1); console.log('    OK join parentB')"
else
  echo "==> POST /auth/login"
  LOGIN=$(curl -sf -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  TOKEN=$(echo "$LOGIN" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.token||!j.workspace?.inviteCode) process.exit(1); console.log(j.token)")
  echo "    OK token + workspace.inviteCode"
fi

echo "==> GET /auth/session"
curl -sf "$BASE/auth/session" -H "Authorization: Bearer $TOKEN" | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.user?.role) process.exit(1); console.log('    OK role='+j.user.role)"

echo "==> GET /threads"
THREADS=$(curl -sf "$BASE/threads" -H "Authorization: Bearer $TOKEN")
echo "$THREADS" | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(j.threads)) process.exit(1); console.log('    OK threads='+j.threads.length)"

echo "==> POST /threads"
NEW_THREAD=$(curl -sf -X POST "$BASE/threads" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"subject":"Test API","category":"Ogólne"}')
TID=$(echo "$NEW_THREAD" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.id) process.exit(1); console.log(j.id)")
echo "    OK threadId=$TID"

echo "==> POST /threads/:id/messages"
curl -sf -X POST "$BASE/threads/$TID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Wiadomość testowa","tone":"neutral"}' | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.messages?.length) process.exit(1); console.log('    OK messages='+j.messages.length)"

echo "==> GET /exports"
curl -sf "$BASE/exports" -H "Authorization: Bearer $TOKEN" | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(j.jobs)) process.exit(1); console.log('    OK jobs='+j.jobs.length)"

echo "==> POST /exports"
EXPORT=$(curl -sf -X POST "$BASE/exports" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"messages\",\"fromDate\":\"2025-01-01T00:00:00.000Z\",\"toDate\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}")
EID=$(echo "$EXPORT" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.id) process.exit(1); console.log(j.id)")
echo "    OK exportId=$EID"

echo "==> GET /exports/:id/download"
curl -sf "$BASE/exports/$EID/download" -H "Authorization: Bearer $TOKEN" | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.payload) process.exit(1); console.log('    OK payload')"

echo "==> GET /calendar"
CAL=$(curl -sf "$BASE/calendar" -H "Authorization: Bearer $TOKEN")
echo "$CAL" | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(j.custodySlots)||!Array.isArray(j.events)||!Array.isArray(j.swapRequests)) process.exit(1); console.log('    OK slots='+j.custodySlots.length+' events='+j.events.length+' swaps='+j.swapRequests.length)"

echo "==> GET /finances/expenses"
curl -sf "$BASE/finances/expenses" -H "Authorization: Bearer $TOKEN" | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(j.expenses)) process.exit(1); console.log('    OK expenses='+j.expenses.length)"

echo "==> POST /calendar/events"
EVENT=$(curl -sf -X POST "$BASE/calendar/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Test event\",\"startDate\":\"$(date -u +%Y-%m-%dT12:00:00.000Z)\",\"type\":\"school\"}")
echo "$EVENT" | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.id||!j.title) process.exit(1); console.log('    OK eventId='+j.id)"

echo "==> POST /calendar/swaps"
SWAP=$(curl -sf -X POST "$BASE/calendar/swaps" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"originalDate\":\"$(date -u -v+7d +%Y-%m-%dT12:00:00.000Z 2>/dev/null || date -u -d '+7 days' +%Y-%m-%dT12:00:00.000Z)\",\"proposedDate\":\"$(date -u -v+14d +%Y-%m-%dT12:00:00.000Z 2>/dev/null || date -u -d '+14 days' +%Y-%m-%dT12:00:00.000Z)\",\"reason\":\"API verify\"}")
echo "$SWAP" | node -e \
  "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.id||!j.status) process.exit(1); console.log('    OK swapId='+j.id)"

echo "==> POST /auth/logout (204)"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/logout" \
  -H "Authorization: Bearer $TOKEN")
test "$STATUS" = "204" && echo "    OK 204"

echo ""
echo "Wszystkie endpointy Flutter OK."
