-- 003_performance_indexes.sql
--
-- The tables have no indexes besides their primary keys, so every login, duplicate check, "my bookings" list and
-- booking detail reads whole tables. That is invisible with today's ~100 rows and becomes the main cost as they grow.
-- These are plain (non-unique) indexes: they never reject data, so nothing has to be cleaned first.
-- (The UNIQUE indexes on e-mail / mobile live in 001_data_integrity.sql and need the duplicates removed first.)
--
-- CONCURRENTLY: built without locking the tables against writes. It cannot run inside a transaction, so apply
-- this file statement by statement:  node scripts/apply-sql.js migrations/003_performance_indexes.sql
-- Idempotent: safe to run more than once.

-- sign-in, registration duplicate checks, identity changes
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_email_lower ON "USER" (lower(email));
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_mobile ON "USER" (mobile_number);

-- OTP lookups: latest code for an e-mail / mobile
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_otp_email_lower ON "OTP_VERIFICATION" (lower(email), created_on DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_otp_mobile ON "OTP_VERIFICATION" (mobile_number, created_on DESC);

-- a farmer's bookings (booked for them / by them), newest first
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_order_user_created ON "SPRAYING_ORDER" (user_id, created_on DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_order_created_by ON "SPRAYING_ORDER" (created_by, created_on DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_order_status ON "SPRAYING_ORDER" (order_status);

-- everything loaded per booking (list cards, detail screen, admin filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_order_address_order ON "SPRAYING_ORDER_ADDRESS" (order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_order_timeline_booking ON "SPRAYING_ORDER_TIMELINE" (booking_id, created_on);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_order_comment_order ON "SPRAYING_ORDER_COMMENT" (spraying_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_assignee_booking ON "SPRAYING_WORK_ASSIGNEE" (booking_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_daily_log_booking_date ON "SPRAYING_DAILY_LOGS" (spraying_work_id, working_date);

-- a pilot's work and the availability calendar
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_assignee_pilot ON "SPRAYING_WORK_ASSIGNEE" (pilot_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_assignee_copilot ON "SPRAYING_WORK_ASSIGNEE" (co_pilot_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_daily_log_pilot_date ON "SPRAYING_DAILY_LOGS" (pilot_user_id, working_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_daily_log_copilot ON "SPRAYING_DAILY_LOGS" (co_pilot_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_daily_log_drone_date ON "SPRAYING_DAILY_LOGS" (drone_id, working_date);

-- per-user rows read on every authenticated request / profile screen
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_role_user ON "USER_ROLE" (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_profile_user ON "USER_PROFILE" (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_address_user ON "USER_ADDRESS" (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_bank_user ON "USER_BANK_DETAILS" (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_upi_user ON "USER_UPI_DETAILS" (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_documents_user ON "USER_DOCUMENTS" (user_id);
