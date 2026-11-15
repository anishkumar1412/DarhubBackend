-- 002_location_master_cleanup.sql  (NOT applied automatically - review, back up, then run once)
--
-- The state list shown on the sign-up form has a duplicate and inconsistent casing:
--   id 12 'Bihar'  (2 districts)   and   id 22 'BIHAR'  (0 districts, 1 user address points at it)
--   'JHARKHAND', 'ODISHA' in capitals while the rest are Title Case.
-- A farmer who picks the empty 'BIHAR' gets no districts at all.
--
-- Run:  psql "$DATABASE_URL" -f migrations/002_location_master_cleanup.sql

BEGIN;

-- 1. Move everything that points at the empty duplicate onto the real state, then remove the duplicate
UPDATE "USER_ADDRESS"           SET state = 12 WHERE state = 22;
UPDATE "SPRAYING_ORDER_ADDRESS" SET state = 12 WHERE state = 22;
UPDATE "MASTER_DISTRICT"        SET state_id = 12 WHERE state_id = 22;
DELETE FROM "MASTER_STATE" WHERE id = 22 AND lower(trim(state_name)) = 'bihar';

-- 2. One spelling style for every state name
UPDATE "MASTER_STATE" SET state_name = initcap(lower(trim(state_name))) WHERE state_name <> initcap(lower(trim(state_name)));

-- 3. Stop it from happening again: one state per name, ignoring case and spaces
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_state_name ON "MASTER_STATE" (lower(trim(state_name)));

COMMIT;
