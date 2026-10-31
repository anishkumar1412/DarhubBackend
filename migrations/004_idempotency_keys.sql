-- 004_idempotency_keys.sql
--
-- Storage for the Idempotency-Key header (middleware/idempotency.js): a retried or double-tapped booking request
-- returns the first response instead of creating a second booking.
-- The server also creates this table on boot (sequelize.sync creates missing tables), so this file is for
-- environments whose schema is managed by hand. New, empty table: nothing to lock or clean.
-- Idempotent: safe to run more than once.
--   node scripts/apply-sql.js migrations/004_idempotency_keys.sql --apply

CREATE TABLE IF NOT EXISTS "IDEMPOTENCY_KEY" (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER      NOT NULL,
  scope            VARCHAR(120) NOT NULL,
  idem_key         VARCHAR(255) NOT NULL,
  request_hash     VARCHAR(64)  NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'processing',
  response_status  INTEGER,
  response_body    JSONB,
  locked_until     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ  NOT NULL,
  created_on       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  modified_on      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_key_user_scope_key_uq ON "IDEMPOTENCY_KEY" (user_id, scope, idem_key);
CREATE INDEX IF NOT EXISTS idempotency_key_expires_at_idx ON "IDEMPOTENCY_KEY" (expires_at);
