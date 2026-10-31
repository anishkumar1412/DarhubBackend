#!/usr/bin/env bash
# One command: local Postgres (docker) -> copy schema from the dev DB -> start server -> curl suite -> route sweep.
# Needs: docker, psql/pg_dump, curl, jq, node. Reads the dev DB (read-only) from ../../.env only to copy its schema.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$HERE/../..
PG="psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -q"; export PGPASSWORD=testpass
[ -f "$HERE/.env.test" ] || cp "$HERE/env.test.example" "$HERE/.env.test"

if ! docker ps --format '{{.Names}}' | grep -qx darhub-test-pg; then
  docker rm -f darhub-test-pg >/dev/null 2>&1 || true
  docker run -d --name darhub-test-pg -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=darhub_test -p 127.0.0.1:55432:5432 postgres:14 >/dev/null
  for i in $(seq 1 40); do $PG -c 'select 1' >/dev/null 2>&1 && break; sleep 1.5; done
  set -a; . <(grep -E '^(DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME)=' "$ROOT/.env"); set +a
  DUMP=$(mktemp -d)
  PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --schema-only --no-owner --no-privileges -f "$DUMP/schema.sql"
  PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --data-only --no-owner --no-privileges \
    $(for t in STATE DISTRICT BLOCK GRAMPANCHAYAT CROP ROLE PRIVILAGE ROLE_PRIVILAGE WORKING_DAYS ARMS BATTERY CHARGER MOTOR LANDING_GEAR RECEIVER TRANSMITTER BOLT CUPON; do printf -- "-t \"MASTER_%s\" " $t; done) \
    -t '"DRONE"' -t '"DRONE_ADDRESS"' -f "$DUMP/ref.sql"
  $PG -f "$DUMP/schema.sql" >/dev/null 2>&1; $PG -f "$DUMP/ref.sql" >/dev/null 2>&1; rm -rf "$DUMP"
fi

# The dev DB credentials were exported above only to copy the schema; they must NEVER reach the test server
# (dotenv does not override existing variables, so a leaked DB_HOST would make the suite write to the dev DB).
unset DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME DB_SSL
"$HERE/restart.sh"
for i in $(seq 1 60); do grep -q 'setup-password?token=' "$HERE/server.log" 2>/dev/null && break; sleep 1; done
SP=$(pgrep -f "node server.js" | tail -1)
tr '\0' '\n' < /proc/$SP/environ | grep -q '^DB_HOST=' && { echo "ABORT: test server is not pointed at the local DB"; exit 2; }   # first start creates the super admin (setup link in server.log)
python3 "$HERE/list-routes.py"
bash "$HERE/e2e.sh"
node "$HERE/concurrency.mjs"
node "$HERE/cron.mjs"
read -r F P < <($PG -At -F' ' -c "SELECT (SELECT max(id) FROM \"USER\" WHERE user_type=3), (SELECT max(u.id) FROM \"USER\" u JOIN \"USER_ROLE\" ur ON ur.user_id=u.id JOIN \"MASTER_ROLE\" r ON r.id=ur.role_id WHERE r.role_name ILIKE 'pilot')")
node "$HERE/sweep.mjs" "$F" "$P"
