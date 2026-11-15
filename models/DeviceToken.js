/**
 * One row per installed app instance that can receive push notifications (an FCM registration token).
 *
 * - The token is unique across the whole table. When someone else logs in on the same phone the row is simply moved
 *   to the new user (see services/deviceToken.service.js), so a person never receives another person's pushes.
 * - A token FCM reports as dead is switched off (is_active=false) instead of deleted: the delivery history keeps
 *   pointing at a real row, and the cleanup job removes it later.
 */
const DeviceToken = (sequelize, DataTypes) => sequelize.define('DeviceToken', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  app: { type: DataTypes.STRING(16), allowNull: false },            // farmer | pilot (which Darhub app registered it)
  platform: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'android' },
  fcm_token: { type: DataTypes.STRING(512), allowNull: false },
  device_id: { type: DataTypes.STRING(128), allowNull: true },      // stable per install, lets a rotated token replace the old one
  device_name: { type: DataTypes.STRING(120), allowNull: true },
  app_version: { type: DataTypes.STRING(32), allowNull: true },
  os_version: { type: DataTypes.STRING(32), allowNull: true },
  locale: { type: DataTypes.STRING(16), allowNull: true },          // e.g. "en", "hi": picks the notification language
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  failure_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  last_failure_at: { type: DataTypes.DATE, allowNull: true },
  last_failure_reason: { type: DataTypes.STRING(120), allowNull: true },
  created_on: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  modified_on: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'DEVICE_TOKEN',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['fcm_token'], name: 'device_token_fcm_token_uq' },
    { fields: ['user_id', 'is_active'], name: 'device_token_user_active_idx' },
    { fields: ['is_active', 'last_seen_at'], name: 'device_token_active_seen_idx' },
  ],
});

export default DeviceToken;
