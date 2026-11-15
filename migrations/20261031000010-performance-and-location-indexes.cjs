'use strict';
/**
 * Query-performance indexes (db/sql/003_performance_indexes.sql) and the location master indexes
 * (db/sql/005_lgd_location_codes.sql: unique lgd_code per level, parent-id lookups for the district / block /
 * panchayat dropdowns).
 *
 * 003 uses CREATE INDEX CONCURRENTLY (no write lock on a live table), which PostgreSQL refuses inside a transaction:
 * sequelize-cli does not wrap migrations in one, and every statement is sent on its own. Every statement is
 * IF NOT EXISTS, so re-running is safe. The lgd_code columns themselves come from the baseline migrations.
 */
const { readSql, splitStatements } = require('./helpers/schema.cjs');

const FILES = ['005_lgd_location_codes.sql', '003_performance_indexes.sql'];

module.exports = {
  async up(queryInterface) {
    for (const file of FILES) {
      for (const statement of splitStatements(readSql(file))) {
        await queryInterface.sequelize.query(statement);
      }
    }
  },

  async down(queryInterface) {
    const names = FILES.flatMap((file) => [...readSql(file).matchAll(/CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?IF NOT EXISTS (\w+)/g)].map((m) => m[1]));
    for (const name of names) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${name}`);
    }
  },
};
