'use strict';
/**
 * Database-level data integrity (db/sql/001_data_integrity.sql):
 *   - unique indexes: one account per e-mail / mobile, one profile per user, no double-booked pilot or drone per day
 *   - foreign keys between users, roles, orders, addresses, daily logs and assignees
 *   - sanity checks on orders (land > 0, total >= 0, end date not before start date)
 *   - one state per name, ignoring case and spaces (uq_master_state_name)
 *
 * On a fresh database every constraint is created and validated. On a database that already holds data, constraints
 * are created NOT VALID (enforced for every new or changed row, existing rows are checked afterwards): a validation
 * failure is printed as a warning and does not stop the migration. A duplicate that blocks a UNIQUE index does stop it,
 * as it must: clean the data first (npm run audit:data -- --details; db/sql/manual/002_location_master_cleanup.sql).
 */
const { readSql, validateConstraints } = require('./helpers/schema.cjs');

const UNIQUE_STATE_NAME = 'uq_master_state_name';

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(readSql('001_data_integrity.sql'), { transaction });
      try {
        await sequelize.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${UNIQUE_STATE_NAME} ON "MASTER_STATE" (lower(trim(state_name)))`,
          { transaction },
        );
      } catch (err) {
        if (err.original?.code !== '23505') throw err;
        throw new Error(
          'MASTER_STATE has the same state twice (e.g. "Bihar" and "BIHAR"). Run db/sql/manual/002_location_master_cleanup.sql ' +
          'after reviewing it, then run the migrations again.',
        );
      }
    });

    await validateConstraints(queryInterface);
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    const sql = readSql('001_data_integrity.sql');
    const foreignKeys = [...sql.matchAll(/\('([A-Z_]+)',\s+'(fk_\w+)'/g)];
    const checks = [...sql.matchAll(/ADD CONSTRAINT (chk_\w+)/g)];
    const indexes = [...sql.matchAll(/CREATE UNIQUE INDEX IF NOT EXISTS (\w+)/g)];

    for (const [, table, name] of foreignKeys) {
      await sequelize.query(`ALTER TABLE IF EXISTS "${table}" DROP CONSTRAINT IF EXISTS ${name}`);
    }
    for (const [, name] of checks) {
      await sequelize.query(`ALTER TABLE IF EXISTS "SPRAYING_ORDER" DROP CONSTRAINT IF EXISTS ${name}`);
    }
    for (const [, name] of indexes) {
      await sequelize.query(`DROP INDEX IF EXISTS ${name}`);
    }
    await sequelize.query(`DROP INDEX IF EXISTS ${UNIQUE_STATE_NAME}`);
  },
};
