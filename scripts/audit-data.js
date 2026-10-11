/**
 * Read-only data consistency audit.
 *
 *   node scripts/audit-data.js              print every check with its count
 *   node scripts/audit-data.js --details    also print up to 10 offending ids per check
 *   node scripts/audit-data.js --strict     exit with code 1 if any "critical" check finds rows (for CI / deploy gates)
 *
 * Nothing is written: the session is opened read-only. Only ids and counts are printed (no personal data).
 */
import pg from 'pg';
import env from '../config/env.js';

const CHECKS = [
  // ── Accounts ─────────────────────────────────────────────────────────
  ['critical', 'Accounts', 'Same e-mail used by more than one account (ignoring case)',
    `SELECT lower(email) AS id FROM "USER" WHERE email IS NOT NULL AND email <> '' GROUP BY 1 HAVING count(*) > 1`],
  ['critical', 'Accounts', 'Same mobile number used by more than one account',
    `SELECT mobile_number AS id FROM "USER" WHERE mobile_number IS NOT NULL AND mobile_number <> '' GROUP BY 1 HAVING count(*) > 1`],
  ['warning', 'Accounts', 'Accounts with no password',
    `SELECT id::text FROM "USER" WHERE password IS NULL OR password = ''`],
  ['warning', 'Accounts', 'Accounts marked verified although no OTP verification exists for them',
    `SELECT u.id::text FROM "USER" u WHERE (u."isEmailVerify" OR u."isMobileVerify") AND NOT EXISTS (
       SELECT 1 FROM "OTP_VERIFICATION" o WHERE (lower(o.email) = lower(u.email) AND o.is_email_verified) OR (o.mobile_number = u.mobile_number AND o.is_mobile_verified))`],
  ['critical', 'Accounts', 'Accounts without a profile',
    `SELECT u.id::text FROM "USER" u WHERE NOT EXISTS (SELECT 1 FROM "USER_PROFILE" p WHERE p.user_id = u.id)`],
  ['critical', 'Accounts', 'Accounts without a role',
    `SELECT u.id::text FROM "USER" u WHERE NOT EXISTS (SELECT 1 FROM "USER_ROLE" r WHERE r.user_id = u.id)`],
  ['critical', 'Accounts', 'Profiles of accounts that no longer exist',
    `SELECT p.id::text FROM "USER_PROFILE" p WHERE NOT EXISTS (SELECT 1 FROM "USER" u WHERE u.id = p.user_id)`],
  ['critical', 'Accounts', 'Role assignments of accounts that no longer exist',
    `SELECT r.id::text FROM "USER_ROLE" r WHERE NOT EXISTS (SELECT 1 FROM "USER" u WHERE u.id = r.user_id)`],
  ['critical', 'Accounts', 'Addresses of accounts that no longer exist',
    `SELECT a.id::text FROM "USER_ADDRESS" a WHERE NOT EXISTS (SELECT 1 FROM "USER" u WHERE u.id = a.user_id)`],
  ['warning', 'Accounts', 'Farmer accounts holding a non-farmer role',
    `SELECT u.id::text FROM "USER" u JOIN "USER_ROLE" r ON r.user_id = u.id JOIN "MASTER_ROLE" m ON m.id = r.role_id
      WHERE u.user_type = 3 AND lower(m.role_name) NOT LIKE '%farmer%'`],
  ['warning', 'Accounts', 'Accounts with more than one primary address',
    `SELECT user_id::text AS id FROM "USER_ADDRESS" WHERE is_primary AND is_active GROUP BY 1 HAVING count(*) > 1`],

  // ── Addresses ────────────────────────────────────────────────────────
  ['warning', 'Addresses', 'Placeholder addresses (pincode 000000 or village N/A)',
    `SELECT id::text FROM "USER_ADDRESS" WHERE pincode = '000000' OR village = 'N/A'`],
  ['critical', 'Addresses', 'Addresses pointing at a state, district or block that does not exist',
    `SELECT a.id::text FROM "USER_ADDRESS" a WHERE (a.state IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MASTER_STATE" s WHERE s.id = a.state))
       OR (a.district IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MASTER_DISTRICT" d WHERE d.id = a.district))
       OR (a.block IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MASTER_BLOCK" b WHERE b.id = a.block))`],
  ['critical', 'Addresses', 'Addresses whose district is not in the state, or block not in the district',
    `SELECT a.id::text FROM "USER_ADDRESS" a LEFT JOIN "MASTER_DISTRICT" d ON d.id = a.district LEFT JOIN "MASTER_BLOCK" b ON b.id = a.block
      WHERE (d.id IS NOT NULL AND a.state IS NOT NULL AND d.state_id <> a.state) OR (b.id IS NOT NULL AND a.district IS NOT NULL AND b.district_id <> a.district)`],

  // ── Orders & scheduling ──────────────────────────────────────────────
  ['critical', 'Orders', 'Orders whose farmer account does not exist',
    `SELECT o.booking_id::text AS id FROM "SPRAYING_ORDER" o WHERE o.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "USER" u WHERE u.id = o.user_id)`],
  ['warning', 'Orders', 'Orders without an address row',
    `SELECT o.booking_id::text AS id FROM "SPRAYING_ORDER" o WHERE NOT EXISTS (SELECT 1 FROM "SPRAYING_ORDER_ADDRESS" a WHERE a.order_id = o.booking_id)`],
  ['critical', 'Orders', 'Orders with a missing or non-positive price / land area',
    `SELECT booking_id::text AS id FROM "SPRAYING_ORDER" WHERE total_price IS NULL OR total_price <= 0 OR land_in_acers IS NULL OR land_in_acers <= 0`],
  ['warning', 'Orders', 'Orders whose total is not price + tax - discount',
    `SELECT booking_id::text AS id FROM "SPRAYING_ORDER" WHERE price IS NOT NULL AND total_price IS NOT NULL AND abs(total_price - (price + coalesce(tax,0) - coalesce(discount,0))) > 0.05`],
  ['critical', 'Orders', 'Orders ending before they start',
    `SELECT booking_id::text AS id FROM "SPRAYING_ORDER" WHERE end_date < start_date`],
  ['warning', 'Orders', 'Orders whose num_of_days differs from their active working days',
    `SELECT o.booking_id::text AS id FROM "SPRAYING_ORDER" o JOIN (SELECT spraying_work_id, count(*) n FROM "SPRAYING_DAILY_LOGS" WHERE is_active GROUP BY 1) l
       ON l.spraying_work_id = o.booking_id WHERE o.num_of_days <> l.n`],
  ['critical', 'Orders', 'Working days of orders that no longer exist',
    `SELECT l.id::text FROM "SPRAYING_DAILY_LOGS" l WHERE NOT EXISTS (SELECT 1 FROM "SPRAYING_ORDER" o WHERE o.booking_id = l.spraying_work_id)`],
  ['critical', 'Orders', 'Working days assigned to a pilot account that does not exist',
    `SELECT l.id::text FROM "SPRAYING_DAILY_LOGS" l WHERE l.pilot_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "USER" u WHERE u.id = l.pilot_user_id)`],
  ['warning', 'Orders', 'Active working days with no pilot',
    `SELECT id::text FROM "SPRAYING_DAILY_LOGS" WHERE is_active AND pilot_user_id IS NULL`],
  ['critical', 'Orders', 'Same booking scheduled twice on the same date',
    `SELECT spraying_work_id::text || ' ' || working_date::date AS id FROM "SPRAYING_DAILY_LOGS" WHERE is_active GROUP BY spraying_work_id, working_date HAVING count(*) > 1`],
  ['critical', 'Orders', 'A pilot booked on two different orders on the same date',
    `SELECT pilot_user_id::text || ' ' || working_date::date AS id FROM "SPRAYING_DAILY_LOGS" WHERE is_active AND pilot_user_id IS NOT NULL
      GROUP BY pilot_user_id, working_date HAVING count(DISTINCT spraying_work_id) > 1`],
  ['critical', 'Orders', 'A drone booked on two different orders on the same date',
    `SELECT drone_id::text || ' ' || working_date::date AS id FROM "SPRAYING_DAILY_LOGS" WHERE is_active AND drone_id IS NOT NULL
      GROUP BY drone_id, working_date HAVING count(DISTINCT spraying_work_id) > 1`],
  ['critical', 'Orders', 'Active working days on cancelled / rejected orders (they keep blocking the calendar)',
    `SELECT l.id::text FROM "SPRAYING_DAILY_LOGS" l JOIN "SPRAYING_ORDER" o ON o.booking_id = l.spraying_work_id WHERE l.is_active AND o.order_status IN ('ORDER_CANCELLED','ORDER_REJECTED')`],
  ['critical', 'Orders', 'Orders marked completed while a working day is not completed',
    `SELECT DISTINCT o.booking_id::text AS id FROM "SPRAYING_ORDER" o JOIN "SPRAYING_DAILY_LOGS" l ON l.spraying_work_id = o.booking_id AND l.is_active
      WHERE o.order_status = 'ORDER_COMPLETED' AND coalesce(l.verification_comment,'') NOT LIKE '%"day_status":"completed"%'`],
  ['warning', 'Orders', 'Bookings with more than one active assignee row',
    `SELECT booking_id::text AS id FROM "SPRAYING_WORK_ASSIGNEE" WHERE is_active GROUP BY 1 HAVING count(*) > 1`],
  ['warning', 'Orders', 'Orders that carry the made-up coupon id 13 (no coupon system exists)',
    `SELECT booking_id::text AS id FROM "SPRAYING_ORDER" WHERE cupon_id = 13`],

  // ── Housekeeping ─────────────────────────────────────────────────────
  ['info', 'Housekeeping', 'OTP records older than one day (the nightly job removes them)',
    `SELECT id::text FROM "OTP_VERIFICATION" WHERE created_on < now() - interval '1 day'`],
];

const argv = new Set(process.argv.slice(2));
const client = new pg.Client({
  host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000,
});

await client.connect();
await client.query('SET default_transaction_read_only = on');

let criticalFindings = 0;
let lastGroup = '';
for (const [severity, group, title, sql] of CHECKS) {
  if (group !== lastGroup) { console.log(`\n── ${group} ${'─'.repeat(Math.max(2, 60 - group.length))}`); lastGroup = group; }
  let rows;
  try {
    rows = (await client.query(sql)).rows;
  } catch (err) {
    console.log(`  ERR       ${title}  (${err.message.slice(0, 80)})`);
    continue;
  }
  const mark = rows.length === 0 ? 'ok      ' : severity.padEnd(8);
  console.log(`  ${mark}  ${String(rows.length).padStart(5)}  ${title}`);
  if (rows.length && argv.has('--details')) console.log(`             e.g. ${rows.slice(0, 10).map((r) => r.id).join(', ')}`);
  if (rows.length && severity === 'critical') criticalFindings += 1;
}
await client.end();

console.log(`\n${criticalFindings === 0 ? 'No critical inconsistencies.' : `${criticalFindings} critical check(s) found inconsistent rows.`}`);
if (argv.has('--strict') && criticalFindings > 0) process.exit(1);
process.exit(0);
