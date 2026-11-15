'use strict';
/**
 * Push notifications: device tokens, the notification inbox, the push outbox and per-user category preferences.
 * See docs/PUSH_NOTIFICATIONS.md for how the four tables work together.
 *
 * Re-runnable like the baseline migrations: a table that already exists (built earlier by sequelize.sync()) is kept
 * and only missing columns / indexes are added.
 */
const Sequelize = require('sequelize');
const { ensureTables, dropTables, ensureForeignKeys, dropForeignKeys } = require('./helpers/schema.cjs');

const TABLES = [
  ['DEVICE_TOKEN', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
    user_id: { type: Sequelize.INTEGER, allowNull: false },
    app: { type: Sequelize.STRING(16), allowNull: false },
    platform: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'android' },
    fcm_token: { type: Sequelize.STRING(512), allowNull: false },
    device_id: { type: Sequelize.STRING(128), allowNull: true },
    device_name: { type: Sequelize.STRING(120), allowNull: true },
    app_version: { type: Sequelize.STRING(32), allowNull: true },
    os_version: { type: Sequelize.STRING(32), allowNull: true },
    locale: { type: Sequelize.STRING(16), allowNull: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    last_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    failure_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    last_failure_at: { type: Sequelize.DATE, allowNull: true },
    last_failure_reason: { type: Sequelize.STRING(120), allowNull: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    modified_on: { type: Sequelize.DATE, allowNull: true },
  }, [
    [['fcm_token'], { name: 'device_token_fcm_token_uq', unique: true }],
    [['user_id', 'is_active'], { name: 'device_token_user_active_idx' }],
    [['is_active', 'last_seen_at'], { name: 'device_token_active_seen_idx' }],
  ]],
  ['NOTIFICATION', {
    id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
    user_id: { type: Sequelize.INTEGER, allowNull: false },
    type: { type: Sequelize.STRING(64), allowNull: false },
    category: { type: Sequelize.STRING(32), allowNull: false },
    title: { type: Sequelize.STRING(200), allowNull: false },
    body: { type: Sequelize.STRING(1000), allowNull: false },
    data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    priority: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'high' },
    dedupe_key: { type: Sequelize.STRING(160), allowNull: true },
    read_at: { type: Sequelize.DATE, allowNull: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    expires_at: { type: Sequelize.DATE, allowNull: true },
  }, [
    [['user_id', 'created_on', 'id'], { name: 'notification_user_created_idx' }],
    [['user_id'], { name: 'notification_user_unread_idx', where: { read_at: null } }],
    [['user_id', 'dedupe_key'], { name: 'notification_user_dedupe_uq', unique: true, where: { dedupe_key: { [Sequelize.Op.ne]: null } } }],
  ]],
  ['NOTIFICATION_DELIVERY', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
    notification_id: { type: Sequelize.UUID, allowNull: false },
    device_token_id: { type: Sequelize.BIGINT, allowNull: false },
    status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'pending' },
    attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    next_attempt_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    locked_until: { type: Sequelize.DATE, allowNull: true },
    fcm_message_id: { type: Sequelize.STRING(255), allowNull: true },
    error_code: { type: Sequelize.STRING(80), allowNull: true },
    error_message: { type: Sequelize.STRING(500), allowNull: true },
    sent_at: { type: Sequelize.DATE, allowNull: true },
    created_on: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    modified_on: { type: Sequelize.DATE, allowNull: true },
  }, [
    [['notification_id', 'device_token_id'], { name: 'notification_delivery_notif_device_uq', unique: true }],
    [['status', 'next_attempt_at'], { name: 'notification_delivery_queue_idx' }],
    [['device_token_id'], { name: 'notification_delivery_device_idx' }],
  ]],
  ['NOTIFICATION_PREFERENCE', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    user_id: { type: Sequelize.INTEGER, allowNull: false },
    category: { type: Sequelize.STRING(32), allowNull: false },
    push_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    modified_on: { type: Sequelize.DATE, allowNull: true },
  }, [
    [['user_id', 'category'], { name: 'notification_preference_user_category_uq', unique: true }],
  ]],
];

// Removing a user removes their devices, inbox and preferences; removing a notification / device removes its deliveries
const FOREIGN_KEYS = [
  ['DEVICE_TOKEN', 'user_id', 'USER', 'id', 'CASCADE', 'CASCADE'],
  ['NOTIFICATION', 'user_id', 'USER', 'id', 'CASCADE', 'CASCADE'],
  ['NOTIFICATION_DELIVERY', 'notification_id', 'NOTIFICATION', 'id', 'CASCADE', 'CASCADE'],
  ['NOTIFICATION_DELIVERY', 'device_token_id', 'DEVICE_TOKEN', 'id', 'CASCADE', 'CASCADE'],
  ['NOTIFICATION_PREFERENCE', 'user_id', 'USER', 'id', 'CASCADE', 'CASCADE'],
];

module.exports = {
  async up(queryInterface) {
    await ensureTables(queryInterface, TABLES);
    await ensureForeignKeys(queryInterface, FOREIGN_KEYS);
  },

  async down(queryInterface) {
    await dropForeignKeys(queryInterface, FOREIGN_KEYS);
    await dropTables(queryInterface, TABLES);
  },
};
