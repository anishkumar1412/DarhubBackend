/**
 * Merges the official Local Government Directory (LGD, Government of India) into the location master tables:
 * MASTER_STATE, MASTER_DISTRICT, MASTER_BLOCK, MASTER_GRAMPANCHAYAT.
 *
 *   node scripts/download-lgd.js ./lgd-data                              download the CSV files (once)
 *   node scripts/import-lgd.js ./lgd-data                                DRY RUN: does the whole merge in a transaction, prints the
 *                                                                        report, then rolls back
 *   node scripts/import-lgd.js ./lgd-data --apply                        commits it
 *
 * Why a merge and not a reload: addresses, orders and drone service areas point at the existing row ids, so existing
 * rows keep their id and name and only get their official `lgd_code`; everything the directory has that we do not is
 * inserted. Re-running is safe: rows that already carry their code are skipped.
 * Existing rows that look wrong (duplicates, filed under the wrong parent) are REPORTED, never changed.
 *
 * Needs migrations/005_lgd_location_codes.sql first (adds the lgd_code columns).
 * The database comes from the same .env as the server (ENV_FILE=... picks another). It refuses a remote database
 * unless --allow-remote is given, so a stray .env cannot make this run against production by accident.
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import env from '../config/env.js';
import { bestMatch, normalizeName, tidyName } from '../utils/locationMatch.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
const allowRemote = args.includes('--allow-remote');
if (!dir) {
  console.error('Usage: node scripts/import-lgd.js <folder with the LGD csv files> [--apply] [--allow-remote]');
  process.exit(1);
}

const isLocal = ['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST);
console.log(`Database: ${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}   mode: ${apply ? 'APPLY (will commit)' : 'dry run (rolls back)'}`);
if (!isLocal && !allowRemote) {
  console.error('Refusing to run against a remote database. Point ENV_FILE at a local database, or pass --allow-remote if you really mean it.');
  process.exit(2);
}

// ── CSV (quoted fields, "" escapes, CRLF) ────────────────────────────────
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
};
const load = (name) => {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) { console.error(`Missing ${file} (run scripts/download-lgd.js first)`); process.exit(1); }
  return parseCsv(fs.readFileSync(file, 'utf8'));
};

const lgdStates = load('state_lgd_codes.csv');
const lgdDistricts = load('district_lgd_codes.csv');
const lgdBlocks = load('block_lgd_codes.csv');
const lgdPanchayats = load('gram_panchayat_lgd_codes.csv');
const code = (v) => Number.parseInt(v, 10);          // "01" -> 1

// ── Database ─────────────────────────────────────────────────────────────
const client = new pg.Client({
  host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 10_000,
});
await client.connect();

const report = { matched: {}, inserted: {}, alreadyLinked: {}, notes: [] };
const bump = (bucket, level, n = 1) => { report[bucket][level] = (report[bucket][level] ?? 0) + n; };
const BATCH = 5000;

/** Inserts rows with unnest() in batches; returns [{ id, lgd_code }] in insertion order. */
const insertBatch = async (table, nameCol, parentCol, rows) => {
  const out = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH);
    const names = part.map((r) => r.name);
    const codes = part.map((r) => r.lgd);
    const parents = parentCol ? part.map((r) => r.parentId) : null;
    const sql = parentCol
      ? `INSERT INTO "${table}" (${nameCol}, ${parentCol}, lgd_code, is_active, created_on, "createdAt", "updatedAt")
         SELECT n, p, c, true, now(), now(), now() FROM unnest($1::text[], $2::int[], $3::int[]) AS t(n, p, c)
         RETURNING id, lgd_code`
      : `INSERT INTO "${table}" (${nameCol}, lgd_code, is_active, created_on, "createdAt", "updatedAt")
         SELECT n, c, true, now(), now(), now() FROM unnest($1::text[], $2::int[]) AS t(n, c)
         RETURNING id, lgd_code`;
    const res = await client.query(sql, parentCol ? [names, parents, codes] : [names, codes]);
    out.push(...res.rows);
  }
  return out;
};

/** The sequences can sit behind ids that were inserted by hand; align them before inserting. */
const alignSequence = (table) => client.query(
  `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1))`,
);

const setCodes = async (table, pairs) => {          // [{ id, lgd }]
  for (let i = 0; i < pairs.length; i += BATCH) {
    const part = pairs.slice(i, i + BATCH);
    await client.query(
      `UPDATE "${table}" m SET lgd_code = v.c FROM unnest($1::int[], $2::int[]) AS v(id, c)
        WHERE m.id = v.id AND m.lgd_code IS NULL`,
      [part.map((p) => p.id), part.map((p) => p.lgd)],
    );
  }
};

const started = Date.now();
try {
  await client.query('BEGIN');
  for (const t of ['MASTER_STATE', 'MASTER_DISTRICT', 'MASTER_BLOCK', 'MASTER_GRAMPANCHAYAT']) {
    const col = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'lgd_code'`, [t]);
    if (!col.rowCount) throw new Error(`"${t}" has no lgd_code column: apply migrations/005_lgd_location_codes.sql first`);
    await alignSequence(t);
  }

  // ── States ─────────────────────────────────────────────────────────────
  const exStates = (await client.query('SELECT id, state_name AS name, lgd_code FROM "MASTER_STATE" ORDER BY id')).rows;
  // rows that are the same state written twice (BIHAR / Bihar) form one group; the lowest id is the canonical row
  const stateGroups = new Map();                              // normalised name -> [rows]
  for (const s of exStates) {
    const k = normalizeName(s.name);
    stateGroups.set(k, [...(stateGroups.get(k) ?? []), s]);
  }
  for (const [k, rows] of stateGroups) {
    if (rows.length > 1) report.notes.push(`Duplicate states: ${rows.map((r) => `#${r.id} "${r.name}"`).join(', ')} are the same state ("${k}"). Left as they are (addresses may use either); only #${rows[0].id} gets the code.`);
  }
  const stateIdByLgd = new Map();                             // lgd state code -> canonical id
  const stateRowsByLgd = new Map();                           // lgd state code -> every existing row id of that state
  const toInsertStates = [];
  const stateCodeUpdates = [];
  for (const s of lgdStates) {
    const lgd = code(s.state_code);
    const linked = exStates.filter((e) => e.lgd_code === lgd);
    if (linked.length) {
      stateIdByLgd.set(lgd, linked[0].id);
      stateRowsByLgd.set(lgd, stateGroups.get(normalizeName(linked[0].name))?.map((r) => r.id) ?? [linked[0].id]);
      bump('alreadyLinked', 'states');
      continue;
    }
    const match = bestMatch(s.state_name, exStates.map((e) => ({ id: e.id, name: e.name })), { threshold: 0.9 });
    if (match && !exStates.find((e) => e.id === match.id).lgd_code) {
      const group = stateGroups.get(normalizeName(match.name)) ?? [];
      const canonical = group[0]?.id ?? match.id;
      stateIdByLgd.set(lgd, canonical);
      stateRowsByLgd.set(lgd, group.map((r) => r.id));
      stateCodeUpdates.push({ id: canonical, lgd });
      bump('matched', 'states');
    } else {
      toInsertStates.push({ name: tidyName(s.state_name), lgd });
    }
  }
  await setCodes('MASTER_STATE', stateCodeUpdates);
  for (const r of await insertBatch('MASTER_STATE', 'state_name', null, toInsertStates)) {
    stateIdByLgd.set(r.lgd_code, r.id);
    stateRowsByLgd.set(r.lgd_code, [r.id]);
    bump('inserted', 'states');
  }

  // ── Districts ──────────────────────────────────────────────────────────
  const exDistricts = (await client.query('SELECT id, district_name AS name, state_id, lgd_code FROM "MASTER_DISTRICT" ORDER BY id')).rows;
  const districtIdByLgd = new Map();
  const districtRowsByLgd = new Map();
  const claimed = new Set();                                   // existing ids already given a code in this run
  const toInsertDistricts = [];
  const districtCodeUpdates = [];
  for (const d of lgdDistricts) {
    const lgd = code(d.district_code);
    const linked = exDistricts.find((e) => e.lgd_code === lgd);
    if (linked) { districtIdByLgd.set(lgd, linked.id); districtRowsByLgd.set(lgd, [linked.id]); bump('alreadyLinked', 'districts'); continue; }
    const stateRows = new Set(stateRowsByLgd.get(code(d.state_code)) ?? []);
    const pool = exDistricts.filter((e) => stateRows.has(e.state_id) && !e.lgd_code && !claimed.has(e.id));
    const match = bestMatch(d.district_name, pool.map((e) => ({ id: e.id, name: e.name })));
    if (match) {
      claimed.add(match.id);
      districtIdByLgd.set(lgd, match.id);
      districtCodeUpdates.push({ id: match.id, lgd });
      bump('matched', 'districts');
    } else {
      toInsertDistricts.push({ name: tidyName(d.district_name), lgd, parentId: stateIdByLgd.get(code(d.state_code)) });
    }
  }
  await setCodes('MASTER_DISTRICT', districtCodeUpdates);
  for (const r of await insertBatch('MASTER_DISTRICT', 'district_name', 'state_id', toInsertDistricts)) {
    districtIdByLgd.set(r.lgd_code, r.id);
    bump('inserted', 'districts');
  }
  // existing districts that matched nothing: say why they look wrong when we can tell
  const stateNameById = new Map(exStates.map((s) => [s.id, s.name]));
  for (const e of exDistricts.filter((x) => !x.lgd_code && !claimed.has(x.id))) {
    const elsewhere = lgdDistricts.find((d) => normalizeName(d.district_name) === normalizeName(e.name) || bestMatch(e.name, [{ id: 0, name: d.district_name }]));
    if (elsewhere) {
      report.notes.push(`District #${e.id} "${e.name}" is filed under "${stateNameById.get(e.state_id)}" but the directory has it in "${elsewhere.state_name}" (${elsewhere.district_name}). Left unchanged: check the addresses that use it.`);
    } else {
      report.notes.push(`District #${e.id} "${e.name}" (${stateNameById.get(e.state_id)}) is not in the directory.`);
    }
  }

  // ── Blocks ─────────────────────────────────────────────────────────────
  const exBlocks = (await client.query('SELECT id, block_name AS name, district_id, lgd_code FROM "MASTER_BLOCK" ORDER BY id')).rows;
  const blocksByDistrict = new Map();
  for (const b of exBlocks) blocksByDistrict.set(b.district_id, [...(blocksByDistrict.get(b.district_id) ?? []), b]);
  const blockIdByLgd = new Map();
  const toInsertBlocks = [];
  const blockCodeUpdates = [];
  const claimedBlocks = new Set();
  const linkedBlocks = new Map(exBlocks.filter((e) => e.lgd_code).map((e) => [e.lgd_code, e.id]));
  for (const b of lgdBlocks) {
    const lgd = code(b.block_code);
    if (linkedBlocks.has(lgd)) { blockIdByLgd.set(lgd, linkedBlocks.get(lgd)); bump('alreadyLinked', 'blocks'); continue; }
    const districtId = districtIdByLgd.get(code(b.district_code));
    const pool = (blocksByDistrict.get(districtId) ?? []).filter((e) => !e.lgd_code && !claimedBlocks.has(e.id));
    const match = pool.length ? bestMatch(b.block_name, pool.map((e) => ({ id: e.id, name: e.name }))) : null;
    if (match) {
      claimedBlocks.add(match.id);
      blockIdByLgd.set(lgd, match.id);
      blockCodeUpdates.push({ id: match.id, lgd });
      bump('matched', 'blocks');
    } else {
      toInsertBlocks.push({ name: tidyName(b.block_name), lgd, parentId: districtId });
    }
  }
  await setCodes('MASTER_BLOCK', blockCodeUpdates);
  for (const r of await insertBatch('MASTER_BLOCK', 'block_name', 'district_id', toInsertBlocks)) {
    blockIdByLgd.set(r.lgd_code, r.id);
    bump('inserted', 'blocks');
  }
  for (const e of exBlocks.filter((x) => !x.lgd_code && !claimedBlocks.has(x.id))) {
    report.notes.push(`Block #${e.id} "${e.name}" has no match in the directory (kept as it is).`);
  }

  // ── Gram panchayats ────────────────────────────────────────────────────
  const exGp = (await client.query('SELECT id, gram_panchayat_name AS name, block_id, lgd_code FROM "MASTER_GRAMPANCHAYAT" ORDER BY id')).rows;
  const gpByBlock = new Map();
  for (const g of exGp) gpByBlock.set(g.block_id, [...(gpByBlock.get(g.block_id) ?? []), g]);
  const linkedGp = new Set(exGp.filter((e) => e.lgd_code).map((e) => e.lgd_code));
  const claimedGp = new Set();
  const toInsertGp = [];
  const gpCodeUpdates = [];
  for (const g of lgdPanchayats) {
    const lgd = code(g.gp_code);
    if (linkedGp.has(lgd)) { bump('alreadyLinked', 'panchayats'); continue; }
    const blockId = blockIdByLgd.get(code(g.block_code));
    if (!blockId) { report.notes.push(`Panchayat ${lgd} "${g.gp_name}": its block ${g.block_code} is unknown, skipped.`); continue; }
    const pool = gpByBlock.get(blockId);
    const match = pool ? bestMatch(g.gp_name, pool.filter((e) => !e.lgd_code && !claimedGp.has(e.id)).map((e) => ({ id: e.id, name: e.name }))) : null;
    if (match) {
      claimedGp.add(match.id);
      gpCodeUpdates.push({ id: match.id, lgd });
      bump('matched', 'panchayats');
    } else {
      toInsertGp.push({ name: tidyName(g.gp_name), lgd, parentId: blockId });
    }
  }
  await setCodes('MASTER_GRAMPANCHAYAT', gpCodeUpdates);
  const gpInserted = await insertBatch('MASTER_GRAMPANCHAYAT', 'gram_panchayat_name', 'block_id', toInsertGp);
  bump('inserted', 'panchayats', gpInserted.length);

  await client.query('ANALYZE "MASTER_STATE"');
  await client.query('ANALYZE "MASTER_DISTRICT"');
  await client.query('ANALYZE "MASTER_BLOCK"');
  await client.query('ANALYZE "MASTER_GRAMPANCHAYAT"');

  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nFAILED, nothing was changed: ${err.message}`);
  await client.end();
  process.exit(1);
}

const levels = ['states', 'districts', 'blocks', 'panchayats'];
console.log(`\n${apply ? 'COMMITTED' : 'DRY RUN (rolled back, nothing changed)'} in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
console.log('level        matched existing   already linked   newly inserted');
for (const l of levels) {
  console.log(`${l.padEnd(12)} ${String(report.matched[l] ?? 0).padStart(16)} ${String(report.alreadyLinked[l] ?? 0).padStart(16)} ${String(report.inserted[l] ?? 0).padStart(16)}`);
}
if (report.notes.length) {
  console.log(`\n${report.notes.length} note(s) about existing rows (nothing was changed for these):`);
  report.notes.slice(0, 60).forEach((n) => console.log(`  - ${n}`));
  if (report.notes.length > 60) console.log(`  ... and ${report.notes.length - 60} more`);
}
if (!apply) console.log('\nRe-run with --apply to commit.');
await client.end();
