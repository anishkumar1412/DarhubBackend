'use strict';
/**
 * Roles, privileges and admin accounts.
 *
 * Baseline schema, generated from the Sequelize models as they were at the first release. A fresh database gets
 * every table below; a database that was built earlier by sequelize.sync() keeps its tables and data (nothing is
 * altered or dropped) and only gains columns it is missing — see migrations/helpers/schema.cjs.
 */
const Sequelize = require('sequelize');
const { ensureTables, dropTables } = require('./helpers/schema.cjs');

const TABLES = [
  ['MASTER_ROLE', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    role_name: { type: Sequelize.STRING, allowNull: true },
    role_desc: { type: Sequelize.STRING, allowNull: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    modified_on: { type: Sequelize.DATE, allowNull: true },
    modified_by: { type: Sequelize.INTEGER, allowNull: true },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false },
  }],
  ['MASTER_PRIVILAGE', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    privilage_name: { type: Sequelize.STRING, allowNull: true },
    privilage_desc: { type: Sequelize.STRING, allowNull: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    modified_on: { type: Sequelize.DATE, allowNull: true },
    modified_by: { type: Sequelize.INTEGER, allowNull: true },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false },
  }],
  ['MASTER_ROLE_PRIVILAGE', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    role_id: { type: Sequelize.INTEGER, allowNull: true },
    privilage_id: { type: Sequelize.INTEGER, allowNull: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    modified_on: { type: Sequelize.DATE, allowNull: true },
    modified_by: { type: Sequelize.INTEGER, allowNull: true },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false },
  }],
  ['ADMIN_PROFILE', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    user_id: { type: Sequelize.INTEGER, allowNull: false, unique: true },
    full_name: { type: Sequelize.STRING(150), allowNull: false },
    email: { type: Sequelize.STRING, allowNull: false, unique: true },
    is_verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    last_login: { type: Sequelize.DATE, allowNull: true },
    setup_token: { type: Sequelize.STRING, allowNull: true },
    setup_token_expires_at: { type: Sequelize.DATE, allowNull: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    modified_on: { type: Sequelize.DATE, allowNull: true },
    modified_by: { type: Sequelize.INTEGER, allowNull: true },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false },
  }, [
    [['email'], { name: 'a_d_m_i_n__p_r_o_f_i_l_e_email' }],
    [['user_id'], { name: 'a_d_m_i_n__p_r_o_f_i_l_e_user_id' }],
    [['setup_token'], { name: 'a_d_m_i_n__p_r_o_f_i_l_e_setup_token' }],
  ]],
  ['audit_logs', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    method: { type: Sequelize.STRING, allowNull: false },
    api_route: { type: Sequelize.STRING, allowNull: false },
    ip_address: { type: Sequelize.STRING, allowNull: true },
    user_id: { type: Sequelize.INTEGER, allowNull: true },
    audit_fields: { type: Sequelize.STRING, allowNull: true },
    payload_history: { type: Sequelize.TEXT, allowNull: true },
    response_history: { type: Sequelize.TEXT, allowNull: true },
    response_status: { type: Sequelize.INTEGER, allowNull: true },
    response_time: { type: Sequelize.FLOAT, allowNull: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    modified_on: { type: Sequelize.DATE, allowNull: true },
    modified_by: { type: Sequelize.INTEGER, allowNull: true },
  }],
  ['COLUMN_SETTINGS', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    module: { type: Sequelize.INTEGER, allowNull: false },
    label: { type: Sequelize.STRING, allowNull: false },
    key: { type: Sequelize.STRING, allowNull: false, unique: true },
    characters: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 20 },
    is_sortable: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
    is_filterable: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
    filter_type: { type: Sequelize.ENUM('Text Box', 'Calendar'), allowNull: true, defaultValue: 'Text Box' },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    modified_on: { type: Sequelize.DATE, allowNull: true },
    modified_by: { type: Sequelize.INTEGER, allowNull: true },
  }],
];

module.exports = {
  async up(queryInterface) {
    await ensureTables(queryInterface, TABLES);
  },

  async down(queryInterface) {
    await dropTables(queryInterface, TABLES);
  },
};
