/**
 * Applies migrations/001_data_integrity.sql.
 *
 *   node scripts/apply-integrity.js           dry run: lists what would block the unique indexes, changes nothing
 *   node scripts/apply-integrity.js --apply   runs the migration in a single transaction (all or nothing)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import env from '../config/env.js';

const sqlFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/001_data_integrity.sql');
const apply = process.argv.includes('--apply');

// What stops each unique index from being created
const BLOCKERS = [
  ['uq_user_email_lower', `SELECT lower(email) k, count(*) FROM "USER" WHERE email IS NOT NULL AND email <> '' GROUP BY 1 HAVING count(*) > 1`],
  ['uq_user_mobile', `SELECT mobile_number k, count(*) FROM "USER" WHERE mobile_number IS NOT NULL AND mobile_number <> '' GROUP BY 1 HAVING count(*) > 1`],
  ['uq_user_profile_user', `SELECT user_id::text k, count(*) FROM "USER_PROFILE" GROUP BY 1 HAVING count(*) > 1`],
  ['uq_user_role_pair', `SELECT user_id || '/' || role_id k, count(*) FROM "USER_ROLE" GROUP BY user_id, role_id HAVING count(*) > 1`],
  ['uq_daily_log_booking_date', `SELECT spraying_work_id || ' ' || working_date::date k, count(*) FROM "SPRAYING_DAILY_LOGS" WHERE is_active GROUP BY spraying_work_id, working_date HAVING count(*) > 1`],
  ['uq_daily_log_pilot_date', `SELECT pilot_user_id || ' ' || working_date::date k, count(*) FROM "SPRAYING_DAILY_LOGS" WHERE is_active AND pilot_user_id IS NOT NULL GROUP BY pilot_user_id, working_date HAVING count(*) > 1`],
  ['uq_daily_log_drone_date', `SELECT drone_id || ' ' || working_date::date k, count(*) FROM "SPRAYING_DAILY_LOGS" WHERE is_active AND drone_id IS NOT NULL GROUP BY drone_id, working_date HAVING count(*) > 1`],
  ['uq_work_assignee_booking', `SELECT booking_id::text k, count(*) FROM "SPRAYING_WORK_ASSIGNEE" WHERE is_active GROUP BY 1 HAVING count(*) > 1`],
];

const client = new pg.Client({
  host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000,
});
await client.connect();

let blocked = 0;
for (const [index, sql] of BLOCKERS) {
  const rows = (await client.query(sql)).rows;
  if (rows.length) {
    blocked += 1;
    console.log(`BLOCKED  ${index}: ${rows.length} duplicate group(s), e.g. ${rows.slice(0, 5).map((r) => `${r.k} (x${r.count})`).join(', ')}`);
  } else {
    console.log(`ok       ${index}`);
  }
}

if (!apply) {
  console.log(blocked
    ? `\nDry run: ${blocked} unique index(es) cannot be created until the duplicates above are resolved.`
    : '\nDry run: nothing blocks the migration. Re-run with --apply to execute it.');
  await client.end();
  process.exit(blocked ? 1 : 0);
}

if (blocked) {
  console.error('\nRefusing to apply: resolve the duplicates above first.');
  await client.end();
  process.exit(1);
}

try {
  await client.query('BEGIN');
  await client.query(fs.readFileSync(sqlFile, 'utf8'));
  await client.query('COMMIT');
  console.log('\nMigration applied.');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nMigration failed and was rolled back: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
