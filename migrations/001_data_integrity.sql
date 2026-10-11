-- 001_data_integrity.sql
--
-- The tables were created by Sequelize `sync()` from models that declare no unique keys and no foreign keys, so
-- the database itself enforces nothing: two accounts can share an e-mail, a working day can point at a deleted
-- order, a pilot can be double-booked. The application now checks these rules inside transactions, and this
-- migration adds the database-level safety net underneath.
--
-- Run with:  node scripts/apply-integrity.js            (dry run: reports what blocks it, changes nothing)
--            node scripts/apply-integrity.js --apply    (applies everything below in ONE transaction)
--
-- Unique indexes cannot be created while duplicates exist: clean those rows first (the audit lists them:
-- `node scripts/audit-data.js --details`). Foreign keys and checks are added NOT VALID: they protect every new
-- or changed row immediately, and existing orphan rows do not block the migration. Once the data is cleaned,
-- run the VALIDATE statements at the bottom.
--
-- Idempotent: safe to run more than once.

-- ── 1. Uniqueness ─────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email_lower
  ON "USER" (lower(email)) WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_mobile
  ON "USER" (mobile_number) WHERE mobile_number IS NOT NULL AND mobile_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profile_user
  ON "USER_PROFILE" (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_role_pair
  ON "USER_ROLE" (user_id, role_id);

-- one active schedule row per booking and date
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_log_booking_date
  ON "SPRAYING_DAILY_LOGS" (spraying_work_id, working_date) WHERE is_active;

-- a pilot / drone cannot be on two bookings on the same date
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_log_pilot_date
  ON "SPRAYING_DAILY_LOGS" (pilot_user_id, working_date) WHERE is_active AND pilot_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_log_drone_date
  ON "SPRAYING_DAILY_LOGS" (drone_id, working_date) WHERE is_active AND drone_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_assignee_booking
  ON "SPRAYING_WORK_ASSIGNEE" (booking_id) WHERE is_active;

-- ── 2. Foreign keys (NOT VALID: enforced for new/changed rows, existing orphans do not block) ────────────────
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('USER_PROFILE',            'fk_user_profile_user',     'user_id',          'USER',            'id'),
    ('USER_ROLE',               'fk_user_role_user',        'user_id',          'USER',            'id'),
    ('USER_ROLE',               'fk_user_role_role',        'role_id',          'MASTER_ROLE',     'id'),
    ('USER_ADDRESS',            'fk_user_address_user',     'user_id',          'USER',            'id'),
    ('SPRAYING_ORDER',          'fk_order_user',            'user_id',          'USER',            'id'),
    ('SPRAYING_ORDER_ADDRESS',  'fk_order_address_order',   'order_id',         'SPRAYING_ORDER',  'booking_id'),
    ('SPRAYING_DAILY_LOGS',     'fk_daily_log_order',       'spraying_work_id', 'SPRAYING_ORDER',  'booking_id'),
    ('SPRAYING_DAILY_LOGS',     'fk_daily_log_pilot',       'pilot_user_id',    'USER',            'id'),
    ('SPRAYING_WORK_ASSIGNEE',  'fk_work_assignee_order',   'booking_id',       'SPRAYING_ORDER',  'booking_id'),
    ('SPRAYING_WORK_ASSIGNEE',  'fk_work_assignee_pilot',   'pilot_user_id',    'USER',            'id'),
    ('SPRAYING_ORDER_TIMELINE', 'fk_order_timeline_order',  'booking_id',       'SPRAYING_ORDER',  'booking_id')
  ) AS t(tbl, name, col, ref_tbl, ref_col)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = fk.tbl)
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I (%I) NOT VALID',
                     fk.tbl, fk.name, fk.col, fk.ref_tbl, fk.ref_col);
    END IF;
  END LOOP;
END $$;

-- ── 3. Sanity checks on orders (also NOT VALID) ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_land_positive') THEN
    ALTER TABLE "SPRAYING_ORDER" ADD CONSTRAINT chk_order_land_positive CHECK (land_in_acers > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_total_non_negative') THEN
    ALTER TABLE "SPRAYING_ORDER" ADD CONSTRAINT chk_order_total_non_negative CHECK (total_price >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_dates_in_order') THEN
    ALTER TABLE "SPRAYING_ORDER" ADD CONSTRAINT chk_order_dates_in_order CHECK (end_date IS NULL OR end_date >= start_date) NOT VALID;
  END IF;
END $$;

-- ── 4. After cleaning the existing rows (see `node scripts/audit-data.js`), validate them too: ───────────
--   ALTER TABLE "USER_PROFILE"        VALIDATE CONSTRAINT fk_user_profile_user;
--   ALTER TABLE "USER_ROLE"           VALIDATE CONSTRAINT fk_user_role_user;
--   ALTER TABLE "USER_ADDRESS"        VALIDATE CONSTRAINT fk_user_address_user;
--   ALTER TABLE "SPRAYING_ORDER"      VALIDATE CONSTRAINT fk_order_user;
--   ALTER TABLE "SPRAYING_DAILY_LOGS" VALIDATE CONSTRAINT fk_daily_log_order;
--   ALTER TABLE "SPRAYING_DAILY_LOGS" VALIDATE CONSTRAINT fk_daily_log_pilot;
--   ALTER TABLE "SPRAYING_ORDER"      VALIDATE CONSTRAINT chk_order_land_positive;
