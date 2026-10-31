'use strict';
/**
 * Uniqueness for role-based access control data, so the seeders (and the registration flow's findOrCreate of the
 * "Farmer" role) can never produce duplicates, even when two requests race:
 *   - one role per name (ignoring case: registration looks roles up with ILIKE)
 *   - one privilege per name
 *   - one privilege mapping per (role, privilege)
 * A database that already holds duplicates fails here with the list of them (nothing is deleted automatically).
 */
const INDEXES = [
  ['uq_master_role_name_lower', '"MASTER_ROLE"', 'lower(trim(role_name))', 'role_name IS NOT NULL'],
  ['uq_master_privilage_name', '"MASTER_PRIVILAGE"', 'privilage_name', 'privilage_name IS NOT NULL'],
  ['uq_master_role_privilage_pair', '"MASTER_ROLE_PRIVILAGE"', 'role_id, privilage_id', 'role_id IS NOT NULL AND privilage_id IS NOT NULL'],
];

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    for (const [name, table, expression, where] of INDEXES) {
      try {
        await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${table} (${expression}) WHERE ${where}`);
      } catch (err) {
        if (err.original?.code !== '23505') throw err;
        const [dupes] = await sequelize.query(
          `SELECT ${expression} AS key, count(*) FROM ${table} WHERE ${where} GROUP BY ${expression} HAVING count(*) > 1 LIMIT 10`,
        );
        throw new Error(`${table} has duplicates that block ${name}: ${JSON.stringify(dupes)}. Merge them (re-point USER_ROLE / MASTER_ROLE_PRIVILAGE first), then run the migrations again.`);
      }
    }
  },

  async down(queryInterface) {
    for (const [name] of INDEXES) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${name}`);
    }
  },
};
