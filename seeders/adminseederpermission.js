/**
 * seeders/seed.js  —  DARHUB Database Seeder  (v4 — model-aware)
 *
 * ── Why v4? ──────────────────────────────────────────────────────
 * The models use sequelize.define() WITHOUT timestamps:false, so
 * Sequelize automatically adds "createdAt" and "updatedAt" columns
 * to every table in the DB. Raw SQL inserts were missing those
 * columns → NOT NULL violation on "createdAt".
 *
 * Fix: use the Sequelize MODEL instances (db.MasterPrivilage, etc.)
 * for all inserts so Sequelize fills createdAt/updatedAt itself.
 * We still do ONE pre-load SELECT to decide what's missing (so we
 * never duplicate) and ONE bulkCreate for efficiency.
 *
 * Run:
 *   node seeders/seed.js
 */

import db, { syncPromise } from '../models/index.js';

const {
  MasterPrivilage,
  MasterRole,
  MasterRolePrivilage,
} = db;

// ─────────────────────────────────────────────────────────────────
// 1.  ALL PRIVILEGES
// ─────────────────────────────────────────────────────────────────
const ALL_PRIVILEGES = [
  { name: 'admins:view',         desc: 'View list of admin accounts and their details' },
  { name: 'admins:create',       desc: 'Create new admin accounts and resend setup emails' },
  { name: 'admins:delete',       desc: 'Delete admin accounts' },
  { name: 'roles:manage',        desc: 'Create, edit, delete roles and manage their privileges' },
  { name: 'users:view',          desc: 'View user list and individual user profiles' },
  { name: 'users:create',        desc: 'Create new user accounts' },
  { name: 'users:edit',          desc: 'Edit user profile information' },
  { name: 'users:delete',        desc: 'Delete user accounts' },
  { name: 'users:block',         desc: 'Block or suspend user accounts' },
  { name: 'drones:view',         desc: 'View drone list and drone details' },
  { name: 'drones:create',       desc: 'Add new drones to the system' },
  { name: 'drones:edit',         desc: 'Edit drone information and components' },
  { name: 'drones:delete',       desc: 'Delete drones from the system' },
  { name: 'orders:view',         desc: 'View spraying orders and booking details' },
  { name: 'orders:create',       desc: 'Create new spraying orders' },
  { name: 'orders:edit',         desc: 'Update order status and details' },
  { name: 'orders:delete',       desc: 'Delete or cancel orders' },
  { name: 'orders:assign',       desc: 'Assign work / pilots to orders' },
  { name: 'payments:view',       desc: 'View payment records and transactions' },
  { name: 'payments:manage',     desc: 'Update payment status and issue refunds' },
  { name: 'crops:view',          desc: 'View crop master list' },
  { name: 'crops:manage',        desc: 'Create, edit and delete crop entries' },
  { name: 'locations:view',      desc: 'View location master data' },
  { name: 'locations:manage',    desc: 'Create and update location master data' },
  { name: 'working_days:view',   desc: 'View working day calendar' },
  { name: 'working_days:manage', desc: 'Set and update working days' },
  { name: 'reports:view',        desc: 'Access reports and analytics dashboards' },
  { name: 'reports:export',      desc: 'Export reports to CSV / PDF' },
  { name: 'audit:view',          desc: 'View system audit logs' },
  { name: 'dashboard:view',      desc: 'Access the admin dashboard' },
];

// ─────────────────────────────────────────────────────────────────
// 2.  ROLES + default privilege sets
// ─────────────────────────────────────────────────────────────────
const ROLES = [
  {
    name: 'super_admin',
    desc: 'Full system access — all privileges automatically assigned',
    privileges: '__ALL__',
  },
  {
    name: 'manager',
    desc: 'Manages day-to-day operations: orders, users, drones, payments',
    privileges: [
      'dashboard:view',
      'users:view', 'users:create', 'users:edit',
      'drones:view', 'drones:create', 'drones:edit',
      'orders:view', 'orders:create', 'orders:edit', 'orders:assign',
      'payments:view', 'payments:manage',
      'crops:view', 'crops:manage',
      'locations:view',
      'working_days:view', 'working_days:manage',
      'reports:view',
      'admins:view',
    ],
  },
  {
    name: 'operator',
    desc: 'Field operator — views orders, manages drones and daily logs',
    privileges: [
      'dashboard:view',
      'drones:view', 'drones:edit',
      'orders:view', 'orders:edit', 'orders:assign',
      'crops:view',
      'locations:view',
      'working_days:view',
    ],
  },
  {
    name: 'viewer',
    desc: 'Read-only access across the admin panel',
    privileges: [
      'dashboard:view',
      'users:view',
      'drones:view',
      'orders:view',
      'payments:view',
      'crops:view',
      'locations:view',
      'working_days:view',
      'reports:view',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────────────────────────
const log  = (msg) => console.log(`  ✅ ${msg}`);
const info = (msg) => console.log(`\n🔷 ${msg}`);

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  DARHUB — Database Seeder  (v4 — model-aware)');
  console.log('════════════════════════════════════════════════════\n');

  // Wait for all models to sync before touching the DB
  await syncPromise;

  // ── STEP 1: Privileges ───────────────────────────────────────
  info(`Step 1 / 3 — Seeding ${ALL_PRIVILEGES.length} privileges…`);

  // Load ALL existing rows once
  const existingPrivs = await MasterPrivilage.findAll({
    attributes: ['id', 'privilage_name'],
  });

  // name → id map
  const privMap = {};
  for (const p of existingPrivs) privMap[p.privilage_name] = p.id;

  // Determine which are missing
  const missingPrivs = ALL_PRIVILEGES.filter(p => !(p.name in privMap));

  if (missingPrivs.length > 0) {
    // bulkCreate lets Sequelize set createdAt / updatedAt automatically
    const created = await MasterPrivilage.bulkCreate(
      missingPrivs.map(p => ({
        privilage_name: p.name,
        privilage_desc: p.desc,
        is_active:      true,
        created_on:     new Date(),
      })),
      { returning: true }
    );
    for (const row of created) privMap[row.privilage_name] = row.id;
  }

  for (const p of ALL_PRIVILEGES) {
    const isNew = missingPrivs.some(m => m.name === p.name);
    log(`${isNew ? 'Created' : 'Exists '} privilege: ${p.name}  (id=${privMap[p.name]})`);
  }

  // ── STEP 2: Roles ────────────────────────────────────────────
  info(`Step 2 / 3 — Seeding ${ROLES.length} roles…`);

  const existingRoles = await MasterRole.findAll({
    attributes: ['id', 'role_name'],
  });

  const roleMap = {};
  for (const r of existingRoles) roleMap[r.role_name] = r.id;

  const missingRoles = ROLES.filter(r => !(r.name in roleMap));

  if (missingRoles.length > 0) {
    const created = await MasterRole.bulkCreate(
      missingRoles.map(r => ({
        role_name:  r.name,
        role_desc:  r.desc,
        is_active:  true,
        created_on: new Date(),
      })),
      { returning: true }
    );
    for (const row of created) roleMap[row.role_name] = row.id;
  }

  for (const r of ROLES) {
    const isNew = missingRoles.some(m => m.name === r.name);
    log(`${isNew ? 'Created' : 'Exists '} role: ${r.name}  (id=${roleMap[r.name]})`);
  }

  // ── STEP 3: Role → Privilege mappings ───────────────────────
  info('Step 3 / 3 — Assigning privileges to roles…');

  // Load ALL existing mappings in one query → Set of "roleId:privId"
  const existingMappings = await MasterRolePrivilage.findAll({
    attributes: ['role_id', 'privilage_id'],
  });

  const existingSet = new Set(
    existingMappings.map(m => `${m.role_id}:${m.privilage_id}`)
  );

  // Collect every mapping that needs inserting
  const toInsert = [];

  for (const r of ROLES) {
    const roleId    = roleMap[r.name];
    const privNames = r.privileges === '__ALL__'
      ? ALL_PRIVILEGES.map(p => p.name)
      : r.privileges;

    let added = 0, skipped = 0;

    for (const privName of privNames) {
      const privId = privMap[privName];
      if (!privId) continue;

      const key = `${roleId}:${privId}`;
      if (existingSet.has(key)) {
        skipped++;
      } else {
        toInsert.push({ role_id: roleId, privilage_id: privId, is_active: true, created_on: new Date() });
        existingSet.add(key); // prevent duplicates within this run
        added++;
      }
    }

    log(
      `Role "${r.name}" — ${added} to add, ${skipped} already exist` +
      `  (total: ${privNames.length})`
    );
  }

  // One bulkCreate for all new mappings — Sequelize handles createdAt/updatedAt
  if (toInsert.length > 0) {
    await MasterRolePrivilage.bulkCreate(toInsert);
    log(`Inserted ${toInsert.length} role-privilege mapping(s).`);
  } else {
    log('All role-privilege mappings already exist — nothing to insert.');
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════');
  console.log('  ✅ Seeding completed successfully!');
  console.log('════════════════════════════════════════════════════');
  console.log(`\n  super_admin → ALL ${ALL_PRIVILEGES.length} privileges assigned.`);
  console.log(`  Roles: ${ROLES.map(r => r.name).join(' | ')}`);
  console.log();
}

seed()
  .catch((err) => {
    console.error('\n❌ Seeder failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(async () => {
    const { sequelize } = db;
    await sequelize.close();
    process.exit(0);
  });