/**
 * bootstrap/superAdmin.bootstrap.js  — updated
 *
 * Changes from original:
 *   + Step 5: ensureSuperAdminHasAllPrivileges()
 *     After the super_admin role is guaranteed to exist, this function
 *     reads every row in MASTER_PRIVILAGE and bulk-inserts any
 *     MASTER_ROLE_PRIVILAGE mapping that is missing.
 *     This is idempotent — existing rows are never touched.
 *
 *   WHY:  The requirePermission() middleware checks
 *         req.admin.permissions.includes(perm) with NO super_admin bypass.
 *         Therefore every permission must exist as a DB row for the
 *         super_admin role, or the super admin will be blocked from
 *         protected routes just like any other admin.
 */

import { Op } from 'sequelize';
import db from '../models/index.js';
import env from '../config/env.js';
import {
  generateOneTimeToken,
  buildSetupLink,
} from '../utils/adminToken.util.js';
import { sendAdminSetupEmail } from '../services/email.service.js';

const {
  User,
  AdminProfile,
  UserRole,
  MasterRole,
  MasterPrivilage,
  MasterRolePrivilage,
  sequelize,
} = db;

// ── helpers ────────────────────────────────────────────────────────

const ensureSuperAdminRole = async (t) => {
  const [role] = await MasterRole.findOrCreate({
    where:    { role_name: 'super_admin' },
    defaults: {
      role_name: 'super_admin',
      role_desc: 'Full system access — cannot be assigned via API',
    },
    transaction: t,
  });
  return role;
};

const dispatchSetupEmail = async (email, fullName, rawToken) => {
  const setupLink = buildSetupLink(rawToken);
  console.log(`\n🔑 [Bootstrap] Super admin setup link for ${email}:`);
  console.log(`   ${setupLink}\n`);
  try {
    await sendAdminSetupEmail(email, fullName, setupLink);
    console.log(`✅ [Bootstrap] Setup email sent to ${email}`);
  } catch (err) {
    console.warn(
      `⚠️  [Bootstrap] Could not send setup email (${err.message}). ` +
      `Use the link logged above to complete setup.`
    );
  }
};

/**
 * NEW — Grant every privilege in MASTER_PRIVILAGE to the super_admin role.
 * Runs after the super_admin role is guaranteed to exist.
 * Idempotent: uses findOrCreate, never removes or overwrites existing rows.
 */
const ensureSuperAdminHasAllPrivileges = async (superAdminRole) => {
  try {
    // Fetch every privilege row
    const allPrivileges = await MasterPrivilage.findAll();

    if (allPrivileges.length === 0) {
      console.log(
        '⚠️  [Bootstrap] No privileges found in MASTER_PRIVILAGE. ' +
        'Run "node seeders/seed.js" to populate privileges first.'
      );
      return;
    }

    // Fetch existing mappings for super_admin in one query
    const existing = await MasterRolePrivilage.findAll({
      where: { role_id: superAdminRole.id },
      attributes: ['privilage_id'],
    });
    const existingIds = new Set(existing.map((r) => r.privilage_id));

    // Determine which are missing
    const missing = allPrivileges.filter((p) => !existingIds.has(p.id));

    if (missing.length === 0) {
      console.log(
        `✅ [Bootstrap] super_admin already has all ${allPrivileges.length} privilege(s).`
      );
      return;
    }

    // Bulk insert the missing mappings
    await MasterRolePrivilage.bulkCreate(
      missing.map((p) => ({
        role_id:      superAdminRole.id,
        privilage_id: p.id,
      })),
      { ignoreDuplicates: true }   // safety net — never throw on race condition
    );

    console.log(
      `✅ [Bootstrap] Granted ${missing.length} new privilege(s) to super_admin ` +
      `(${allPrivileges.length} total).`
    );
  } catch (err) {
    // Never crash the server because of privilege sync
    console.error(
      '❌ [Bootstrap] Failed to sync super_admin privileges:',
      err.message
    );
  }
};

// ── main export ────────────────────────────────────────────────────

export const bootstrapSuperAdmin = async () => {
  const email    = env.SUPER_ADMIN_EMAIL;
  const fullName = env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email) {
    console.warn(
      '⚠️  [Bootstrap] SUPER_ADMIN_EMAIL is not set in .env — skipping super admin setup.'
    );
    return;
  }

  try {
    // ── Step 1: look up existing super admin user ─────────────────
    const existingUser = await User.findOne({
      where: { email, user_type: 2 },
    });

    // ── CASE A: No user yet → full creation flow ──────────────────
    if (!existingUser) {
      const { raw, hashed } = generateOneTimeToken();
      const expiresAt = new Date(
        Date.now() + (env.ADMIN_SETUP_EXPIRY_HOURS || 24) * 60 * 60 * 1000
      );

      let superAdminRole;

      await sequelize.transaction(async (t) => {
        superAdminRole = await ensureSuperAdminRole(t);

        const user = await User.create(
          {
            email,
            password:      null,
            username:      fullName,
            mobile_number: null,
            is_superuser:  true,
            user_type:     2,
          },
          { transaction: t }
        );

        await AdminProfile.create(
          {
            user_id:                user.id,
            full_name:              fullName,
            email,
            is_verified:            false,
            setup_token:            hashed,
            setup_token_expires_at: expiresAt,
          },
          { transaction: t }
        );

        await UserRole.create(
          { user_id: user.id, role_id: superAdminRole.id },
          { transaction: t }
        );
      });

      console.log(`✅ [Bootstrap] Super admin account created for ${email}`);

      // ── NEW: grant all privileges ─────────────────────────────
      await ensureSuperAdminHasAllPrivileges(superAdminRole);

      await dispatchSetupEmail(email, fullName, raw);
      return;
    }

    // ── CASE B: User exists but AdminProfile missing ──────────────
    const profile = await AdminProfile.findOne({
      where: { user_id: existingUser.id },
    });

    let superAdminRole;

    if (!profile) {
      const { raw, hashed } = generateOneTimeToken();
      const expiresAt = new Date(
        Date.now() + (env.ADMIN_SETUP_EXPIRY_HOURS || 24) * 60 * 60 * 1000
      );

      await sequelize.transaction(async (t) => {
        superAdminRole = await ensureSuperAdminRole(t);

        await AdminProfile.create(
          {
            user_id:                existingUser.id,
            full_name:              fullName,
            email,
            is_verified:            false,
            setup_token:            hashed,
            setup_token_expires_at: expiresAt,
          },
          { transaction: t }
        );

        const existingRole = await UserRole.findOne({
          where: { user_id: existingUser.id },
          transaction: t,
        });
        if (!existingRole) {
          await UserRole.create(
            { user_id: existingUser.id, role_id: superAdminRole.id },
            { transaction: t }
          );
        }
      });

      console.log(`♻️  [Bootstrap] AdminProfile recreated for ${email}`);
      await ensureSuperAdminHasAllPrivileges(superAdminRole);
      await dispatchSetupEmail(email, fullName, raw);
      return;
    }

    // ── Ensure the role exists and get it (needed for privilege sync) ─
    superAdminRole = await MasterRole.findOne({ where: { role_name: 'super_admin' } });
    if (!superAdminRole) {
      superAdminRole = await MasterRole.create({
        role_name: 'super_admin',
        role_desc: 'Full system access — cannot be assigned via API',
      });
    }

    // ── Always sync privileges, even for already-verified super admin ─
    // This ensures any NEW privileges added later are automatically
    // granted on the next server restart without re-running the seeder.
    await ensureSuperAdminHasAllPrivileges(superAdminRole);

    // ── CASE C: Already fully verified → nothing else to do ──────
    if (profile.is_verified) {
      console.log(`ℹ️  [Bootstrap] Super admin (${email}) is already set up.`);
      return;
    }

    // ── CASE D: Exists but not verified — refresh setup token ─────
    const { raw, hashed } = generateOneTimeToken();
    const expiresAt = new Date(
      Date.now() + (env.ADMIN_SETUP_EXPIRY_HOURS || 24) * 60 * 60 * 1000
    );

    await profile.update({
      setup_token:            hashed,
      setup_token_expires_at: expiresAt,
    });

    const tokenStatus =
      !profile.setup_token_expires_at ||
      new Date(profile.setup_token_expires_at) < new Date()
        ? 'token expired — regenerated'
        : 'not yet verified — resending';

    console.log(`♻️  [Bootstrap] Super admin (${email}) ${tokenStatus}.`);
    await dispatchSetupEmail(email, fullName, raw);

  } catch (err) {
    console.error('❌ [Bootstrap] Super admin bootstrap failed:', err.message);
    console.error(err.stack);
  }
};