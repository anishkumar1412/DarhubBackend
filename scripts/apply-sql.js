/**
 * Runs a migration file statement by statement, outside a transaction (needed for CREATE INDEX CONCURRENTLY).
 *
 *   node scripts/apply-sql.js migrations/003_performance_indexes.sql            dry run: lists the statements
 *   node scripts/apply-sql.js migrations/003_performance_indexes.sql --apply    runs them
 *
 * Only for files of simple one-line-or-more statements ending in ";" (no DO $$ blocks): use apply-integrity.js for 001.
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import env from '../config/env.js';

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) {
  console.error('Usage: node scripts/apply-sql.js <file.sql> [--apply]');
  process.exit(1);
}

const statements = fs.readFileSync(path.resolve(file), 'utf8')
  .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
  .split(';').map((s) => s.trim()).filter(Boolean);

if (!apply) {
  console.log(`Dry run: ${statements.length} statement(s) in ${file}. Re-run with --apply to execute.`);
  statements.forEach((s) => console.log(`  ${s.replace(/\s+/g, ' ')}`));
  process.exit(0);
}

const client = new pg.Client({
  host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000,
});
await client.connect();

let failed = 0;
for (const sql of statements) {
  const started = Date.now();
  try {
    await client.query(sql);
    console.log(`OK    ${sql.replace(/\s+/g, ' ').slice(0, 110)} (${Date.now() - started} ms)`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${sql.replace(/\s+/g, ' ').slice(0, 110)}\n      ${err.message}`);
  }
}
await client.end();
process.exit(failed ? 1 : 0);
