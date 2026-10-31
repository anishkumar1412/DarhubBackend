#!/usr/bin/env bash
# End-to-end API test against the local test server (local Postgres, console e-mail/SMS).
# Usage: bash e2e.sh            (BASE defaults to http://localhost:5799)
set -u
BASE=${BASE:-http://localhost:5799}
DIR=$(cd "$(dirname "$0")" && pwd)
OUT=$DIR/e2e-out; rm -rf "$OUT"; mkdir -p "$OUT"
PASS=0; FAIL=0; FAILS=()
RUN=$(date +%s)                        # unique suffix so the script can run repeatedly on the same database
IP="10.0.$((RUN % 250)).1"             # X-Forwarded-For: each scenario gets its own client address (strict per-IP limits)
N=0

# req METHOD PATH [json-body] [token] -> sets STATUS, BODY
req() {
  local method=$1 path=$2 body=${3:-} token=${4:-}
  N=$((N+1)); local f="$OUT/$N.json"
  local args=(-s -o "$f" -w '%{http_code}' -X "$method" "$BASE$path" -H "X-Forwarded-For: $IP")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data "$body")
  STATUS=$(curl "${args[@]}"); BODY=$(cat "$f")
}
# form METHOD PATH token -F ... -> multipart request
form() {
  local method=$1 path=$2 token=$3; shift 3
  N=$((N+1)); local f="$OUT/$N.json"
  local args=(-s -o "$f" -w '%{http_code}' -X "$method" "$BASE$path" -H "X-Forwarded-For: $IP")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  STATUS=$(curl "${args[@]}" "$@"); BODY=$(cat "$f")
}
# check "name" expected-status [jq-filter that must be true]
check() {
  local name=$1 want=$2 cond=${3:-true} ok=1
  [ "$STATUS" = "$want" ] || ok=0
  if [ $ok = 1 ] && [ "$cond" != true ]; then
    [ "$(echo "$BODY" | jq -r "$cond" 2>/dev/null)" = "true" ] || ok=0
  fi
  if [ $ok = 1 ]; then PASS=$((PASS+1)); echo "PASS  $name";
  else FAIL=$((FAIL+1)); FAILS+=("$name"); echo "FAIL  $name  -> got $STATUS (want $want) #$N: $(echo "$BODY" | head -c 400)"; fi
}
j() { echo "$BODY" | jq -r "$1"; }
section() { echo; echo "=== $1"; IP="10.$((RANDOM % 250)).$((RANDOM % 250)).$((RANDOM % 250))"; }
day() { date -u -d "$(TZ=Asia/Kolkata date +%F) + $1 day" +%F; }   # calendar date in India, +N days
TODAY=$(day 0)

PNG=$DIR/pixel.png; [ -f "$PNG" ] || printf '\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x01\x08\x06\0\0\0\x1f\x15\xc4\x89\0\0\0\rIDATx\x9cc\xf8\x0f\0\0\x01\x01\0\x05\x18\xd8N\0\0\0\0IEND\xaeB`\x82' > "$PNG"
TXT=$DIR/notes.txt; echo "not an image" > "$TXT"

# Reference data from the copied master tables: a consistent state -> district -> block chain, and a mismatched one
read -r STATE DISTRICT BLOCK < <(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -F' ' -c \
  'SELECT s.id, d.id, b.id FROM "MASTER_STATE" s JOIN "MASTER_DISTRICT" d ON d.state_id=s.id JOIN "MASTER_BLOCK" b ON b.district_id=d.id ORDER BY s.id, d.id, b.id LIMIT 1')
OTHER_DISTRICT=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "SELECT id FROM \"MASTER_DISTRICT\" WHERE state_id <> $STATE LIMIT 1")
CROP=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c 'SELECT id FROM "MASTER_CROP" WHERE is_active IS NOT FALSE ORDER BY id LIMIT 1')
DRONE=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c 'SELECT id FROM "DRONE" ORDER BY id LIMIT 1')
DRONE2=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c 'SELECT id FROM "DRONE" ORDER BY id OFFSET 1 LIMIT 1')
echo "state=$STATE district=$DISTRICT block=$BLOCK other_district=$OTHER_DISTRICT crop=$CROP drone=$DRONE today=$TODAY"
ADDR="{\"state\":$STATE,\"district\":$DISTRICT,\"block\":$BLOCK,\"village\":\"Wagholi\",\"lane1\":\"Plot 7\",\"pincode\":\"411001\"}"

# A drone with no active work on the given date (repeated runs on one database leave bookings behind)
free_drone() { PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "SELECT d.id FROM \"DRONE\" d WHERE NOT EXISTS (SELECT 1 FROM \"SPRAYING_DAILY_LOGS\" l WHERE l.drone_id=d.id AND l.is_active AND l.working_date::date='$1') ORDER BY d.id LIMIT 1"; }

source "$DIR/e2e-cases.sh"
source "$DIR/e2e-admin.sh"
source "$DIR/e2e-more.sh"

echo; echo "────────────────────────────────────────"
echo "PASSED $PASS   FAILED $FAIL"
for f in "${FAILS[@]}"; do echo "  ✗ $f"; done
[ $FAIL = 0 ]
