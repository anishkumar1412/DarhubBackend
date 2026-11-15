'use strict';
/**
 * Reference data the application cannot run without: admin privileges, roles and the default role -> privilege sets.
 * Safe to run in every environment, including production, and safe to run again on every deploy:
 *
 *   - a privilege or role that is missing is created; one that exists is left exactly as it is
 *   - a NEW role receives its default privileges; an EXISTING role's privileges are never touched, so permissions an
 *     administrator edited in the admin panel are not silently reset by a deploy
 *   - super_admin always holds every privilege in MASTER_PRIVILAGE (the permission middleware has no super-admin bypass)
 *
 * To ship a new privilege: add it to PRIVILEGES, add it to the roles that should get it if they are new, and run
 * `npm run db:seed`. Existing roles are granted it from the admin panel (super_admin gets it automatically).
 *
 * "Pilot" and "Farmer" are the app roles: registration needs them (pilot sign-up fails with a 500 without "Pilot")
 * and they carry no admin privileges.
 *
 * The super-admin USER is not created here: bootstrap/superAdmin.bootstrap.js does it on first boot from
 * SUPER_ADMIN_EMAIL, and mails the one-time setup link.
 */
const { QueryTypes } = require('sequelize');

const PRIVILEGES = [
  ['admins:view',         'View list of admin accounts and their details'],
  ['admins:create',       'Create new admin accounts and resend setup emails'],
  ['admins:delete',       'Delete admin accounts'],
  ['roles:manage',        'Create, edit, delete roles and manage their privileges'],
  ['users:view',          'View user list and individual user profiles'],
  ['users:create',        'Create new user accounts'],
  ['users:edit',          'Edit user profile information'],
  ['users:delete',        'Delete user accounts'],
  ['users:block',         'Block or suspend user accounts'],
  ['drones:view',         'View drone list and drone details'],
  ['drones:create',       'Add new drones to the system'],
  ['drones:edit',         'Edit drone information and components'],
  ['drones:delete',       'Delete drones from the system'],
  ['orders:view',         'View spraying orders and booking details'],
  ['orders:create',       'Create new spraying orders'],
  ['orders:edit',         'Update order status and details'],
  ['orders:delete',       'Delete or cancel orders'],
  ['orders:assign',       'Assign work / pilots to orders'],
  ['payments:view',       'View payment records and transactions'],
  ['payments:manage',     'Update payment status and issue refunds'],
  ['crops:view',          'View crop master list'],
  ['crops:manage',        'Create, edit and delete crop entries'],
  ['locations:view',      'View location master data'],
  ['locations:manage',    'Create and update location master data'],
  ['working_days:view',   'View working day calendar'],
  ['working_days:manage', 'Set and update working days'],
  ['reports:view',        'Access reports and analytics dashboards'],
  ['reports:export',      'Export reports to CSV / PDF'],
  ['audit:view',          'View system audit logs'],
  ['dashboard:view',      'Access the admin dashboard'],
];

const ALL = '__ALL__';
const ROLES = [
  { name: 'super_admin', desc: 'Full system access — cannot be assigned via API', privileges: ALL },
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
      'crops:view', 'locations:view', 'working_days:view',
    ],
  },
  {
    name: 'viewer',
    desc: 'Read-only access across the admin panel',
    privileges: [
      'dashboard:view', 'users:view', 'drones:view', 'orders:view', 'payments:view',
      'crops:view', 'locations:view', 'working_days:view', 'reports:view',
    ],
  },
  { name: 'Pilot', desc: 'Drone pilot (mobile app user)', privileges: [] },
  { name: 'Farmer', desc: 'Farmer user role', privileges: [] },
];

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    const now = new Date();
    // created_on has no database default (Sequelize fills it), and createdAt/updatedAt are NOT NULL
    const audit = () => ({ is_active: true, created_on: now, createdAt: now, updatedAt: now });
    const select = (sql, transaction) => sequelize.query(sql, { type: QueryTypes.SELECT, transaction });

    await sequelize.transaction(async (transaction) => {
      // 1. privileges
      const privilegeId = new Map((await select('SELECT id, privilage_name FROM "MASTER_PRIVILAGE"', transaction)).map((r) => [r.privilage_name, r.id]));
      const missingPrivileges = PRIVILEGES.filter(([name]) => !privilegeId.has(name));
      if (missingPrivileges.length) {
        await queryInterface.bulkInsert('MASTER_PRIVILAGE',
          missingPrivileges.map(([name, desc]) => ({ privilage_name: name, privilage_desc: desc, ...audit() })), { transaction });
        for (const r of await select('SELECT id, privilage_name FROM "MASTER_PRIVILAGE"', transaction)) privilegeId.set(r.privilage_name, r.id);
      }

      // 2. roles (matched case-insensitively, like the registration flow does)
      const key = (name) => String(name).trim().toLowerCase();
      const roleId = new Map((await select('SELECT id, role_name FROM "MASTER_ROLE"', transaction)).map((r) => [key(r.role_name), r.id]));
      const newRoles = ROLES.filter((r) => !roleId.has(key(r.name)));
      if (newRoles.length) {
        await queryInterface.bulkInsert('MASTER_ROLE',
          newRoles.map((r) => ({ role_name: r.name, role_desc: r.desc, ...audit() })), { transaction });
        for (const r of await select('SELECT id, role_name FROM "MASTER_ROLE"', transaction)) roleId.set(key(r.role_name), r.id);
      }

      // 3. role -> privilege mappings: defaults for new roles; everything for super_admin
      const mapped = new Set((await select('SELECT role_id, privilage_id FROM "MASTER_ROLE_PRIVILAGE"', transaction)).map((m) => `${m.role_id}:${m.privilage_id}`));
      const mappings = [];
      const grant = (role, privId) => {
        const id = `${roleId.get(key(role))}:${privId}`;
        if (mapped.has(id)) return;
        mapped.add(id);
        mappings.push({ role_id: roleId.get(key(role)), privilage_id: privId, ...audit() });
      };

      for (const role of newRoles.filter((r) => r.privileges !== ALL)) {
        for (const name of role.privileges) grant(role.name, privilegeId.get(name));
      }
      for (const privId of privilegeId.values()) grant('super_admin', privId);

      if (mappings.length) await queryInterface.bulkInsert('MASTER_ROLE_PRIVILAGE', mappings, { transaction });

      console.log(`  privileges: +${missingPrivileges.length} (${privilegeId.size} total), roles: +${newRoles.length} (${roleId.size} total), role-privilege mappings: +${mappings.length}`);
    });
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      const names = (list) => list.map((n) => sequelize.escape(n)).join(', ');
      // Only what this seeder created, and only roles nobody holds
      await sequelize.query(
        `DELETE FROM "MASTER_ROLE_PRIVILAGE" WHERE role_id IN (SELECT id FROM "MASTER_ROLE" WHERE lower(role_name) IN (${names(ROLES.map((r) => r.name.toLowerCase()))})
           AND id NOT IN (SELECT role_id FROM "USER_ROLE" WHERE role_id IS NOT NULL))`, { transaction });
      await sequelize.query(
        `DELETE FROM "MASTER_ROLE" WHERE lower(role_name) IN (${names(ROLES.map((r) => r.name.toLowerCase()))})
           AND id NOT IN (SELECT role_id FROM "USER_ROLE" WHERE role_id IS NOT NULL)`, { transaction });
      await sequelize.query(
        `DELETE FROM "MASTER_PRIVILAGE" WHERE privilage_name IN (${names(PRIVILEGES.map(([n]) => n))})
           AND id NOT IN (SELECT privilage_id FROM "MASTER_ROLE_PRIVILAGE" WHERE privilage_id IS NOT NULL)`, { transaction });
    });
  },
};
