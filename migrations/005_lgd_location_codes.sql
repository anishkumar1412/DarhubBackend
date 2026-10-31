-- 005_lgd_location_codes.sql
--
-- Official Local Government Directory (LGD, Government of India) codes on the location master tables, so the
-- directory can be merged into the existing rows without breaking the ids that addresses, orders and drones point to
-- (scripts/import-lgd.js does the merge). Also indexes the parent columns: the sign-up / booking dropdowns load
-- "districts of a state", "blocks of a district" and "panchayats of a block" on every open, and the panchayat table
-- grows from a few rows to about 250,000.
-- Only adds nullable columns and indexes: no data is changed. Idempotent: safe to run more than once.
--   node scripts/apply-sql.js migrations/005_lgd_location_codes.sql --apply

ALTER TABLE "MASTER_STATE"        ADD COLUMN IF NOT EXISTS lgd_code INTEGER;
ALTER TABLE "MASTER_DISTRICT"     ADD COLUMN IF NOT EXISTS lgd_code INTEGER;
ALTER TABLE "MASTER_BLOCK"        ADD COLUMN IF NOT EXISTS lgd_code INTEGER;
ALTER TABLE "MASTER_GRAMPANCHAYAT" ADD COLUMN IF NOT EXISTS lgd_code INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS master_state_lgd_code_uq         ON "MASTER_STATE" (lgd_code)         WHERE lgd_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS master_district_lgd_code_uq      ON "MASTER_DISTRICT" (lgd_code)      WHERE lgd_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS master_block_lgd_code_uq         ON "MASTER_BLOCK" (lgd_code)         WHERE lgd_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS master_grampanchayat_lgd_code_uq ON "MASTER_GRAMPANCHAYAT" (lgd_code) WHERE lgd_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS master_district_state_id_idx      ON "MASTER_DISTRICT" (state_id);
CREATE INDEX IF NOT EXISTS master_block_district_id_idx      ON "MASTER_BLOCK" (district_id);
CREATE INDEX IF NOT EXISTS master_grampanchayat_block_id_idx ON "MASTER_GRAMPANCHAYAT" (block_id);
