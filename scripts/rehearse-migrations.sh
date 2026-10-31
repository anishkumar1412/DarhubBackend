#!/usr/bin/env bash
# Release gate: rehearses the whole database lifecycle on a throwaway database inside the local Docker Postgres
# (docker-compose.local-db.yml). Never touches any other database.
#
#   npm run db:rehearse
#
# migrate -> models match the schema (db:check) -> seed twice (idempotent) -> roll everything back -> migrate again.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=darhub-local-pg
DB=darhub_rehearsal
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "Start the database first: docker compose -f docker-compose.local-db.yml up -d --wait"; exit 2; }

ENVF=$(mktemp); trap 'rm -f "$ENVF"; docker exec "$CONTAINER" psql -U darhub -d postgres -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true' EXIT
sed "s/^DB_NAME=.*/DB_NAME=$DB/" .env.local.example > "$ENVF"
export ENV_FILE="$ENVF"

step() { printf '\n== %s\n' "$1"; }
psql_db() { docker exec "$CONTAINER" psql -U darhub -d "$DB" -Atc "$1"; }

docker exec "$CONTAINER" psql -U darhub -d postgres -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"

step "1/6 migrate a brand-new database";           npx sequelize-cli db:migrate | grep -E 'migrated|ERROR'
step "2/6 models match the database";              node scripts/check-schema.js 2>&1 | grep -E 'ERROR|OK:|problem'
step "3/6 reference seed, twice (second adds 0)";  npx sequelize-cli db:seed:all | grep -E 'privileges:|ERROR'; npx sequelize-cli db:seed:all | grep -E 'privileges:|ERROR'
step "4/6 migrations are idempotent";              npx sequelize-cli db:migrate | tail -1
step "5/6 roll everything back"
npx sequelize-cli db:migrate:undo:all | grep -E 'reverted|ERROR' | wc -l | xargs echo "migrations reverted:"
left=$(psql_db "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'SequelizeMeta'")
types=$(psql_db "SELECT count(*) FROM pg_type WHERE typname LIKE 'enum\\_%'")
[ "$left" = 0 ] && [ "$types" = 0 ] && echo "clean: no tables or enum types left behind" || { echo "FAIL: $left table(s), $types enum type(s) left after rollback"; exit 1; }
step "6/6 migrate again after the rollback";       npx sequelize-cli db:migrate | grep -c migrated | xargs echo "migrations applied:"
node scripts/check-schema.js 2>&1 | grep -E 'ERROR|OK:|problem'

printf '\nREHEARSAL PASSED\n'
