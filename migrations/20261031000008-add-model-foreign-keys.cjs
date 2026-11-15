'use strict';
/**
 * Foreign keys declared by the models (`references` on a column).
 *
 * Added after every table exists, so the order of the create-table migrations never matters. Constraint names follow
 * PostgreSQL's own default (<table>_<column>_fkey), the name sequelize.sync() gave them, so a database built earlier
 * is recognised and left alone. The remaining integrity rules (unique indexes, order checks, the SQL-managed
 * foreign keys) live in 20261031000009-data-integrity-constraints.cjs.
 */
const { ensureForeignKeys, dropForeignKeys } = require('./helpers/schema.cjs');

// [table, column, referenced table, referenced column, ON DELETE, ON UPDATE]
const FOREIGN_KEYS = [
  ['SPRAYING_ORDER_EXTRAS', 'booking_id', 'SPRAYING_ORDER', 'booking_id', 'CASCADE', 'CASCADE'],
  ['SPRAYING_ORDER_TIMELINE', 'booking_id', 'SPRAYING_ORDER', 'booking_id', 'CASCADE', 'CASCADE'],
  ['MAINTENANCE_LOG', 'pilot_task_id', 'PILOT_MAINTENANCE_TASK', 'id', 'SET NULL', 'CASCADE'],
  ['PILOT_MAINTENANCE_TASK', 'drone_id', 'DRONE', 'id', 'NO ACTION', 'CASCADE'],
  ['PILOT_MAINTENANCE_TASK', 'pilot_id', 'USER', 'id', 'NO ACTION', 'CASCADE'],
  ['PILOT_MAINTENANCE_TASK', 'engineer_id', 'USER', 'id', 'SET NULL', 'CASCADE'],
  ['PILOT_MAINTENANCE_CHECKLIST', 'task_id', 'PILOT_MAINTENANCE_TASK', 'id', 'CASCADE', 'CASCADE'],
  ['PILOT_MAINTENANCE_ATTACHMENT', 'task_id', 'PILOT_MAINTENANCE_TASK', 'id', 'CASCADE', 'CASCADE'],
];

module.exports = {
  async up(queryInterface) {
    await ensureForeignKeys(queryInterface, FOREIGN_KEYS);
  },

  async down(queryInterface) {
    await dropForeignKeys(queryInterface, FOREIGN_KEYS);
  },
};
