/**
 * The push OUTBOX: one row per notification per device. It is written in the same transaction as the business change
 * that caused it, so a notification exists if and only if that change was committed. A worker (see
 * services/notificationDispatcher.js) claims `pending` rows, sends them through FCM and records the outcome here.
 *
 * status: pending -> sending -> sent
 *                         \-> pending (transient error, retried later with backoff)
 *                         \-> failed (gave up) | invalid_token (FCM says the device is gone) | expired
 */
const NotificationDelivery = (sequelize, DataTypes) => sequelize.define('NotificationDelivery', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  notification_id: { type: DataTypes.UUID, allowNull: false },
  device_token_id: { type: DataTypes.BIGINT, allowNull: false },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  next_attempt_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  locked_until: { type: DataTypes.DATE, allowNull: true },          // a claim older than this belongs to a crashed worker and may be taken over
  fcm_message_id: { type: DataTypes.STRING(255), allowNull: true },
  error_code: { type: DataTypes.STRING(80), allowNull: true },
  error_message: { type: DataTypes.STRING(500), allowNull: true },
  sent_at: { type: DataTypes.DATE, allowNull: true },
  created_on: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  modified_on: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'NOTIFICATION_DELIVERY',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['notification_id', 'device_token_id'], name: 'notification_delivery_notif_device_uq' },
    { fields: ['status', 'next_attempt_at'], name: 'notification_delivery_queue_idx' },
    { fields: ['device_token_id'], name: 'notification_delivery_device_idx' },
  ],
});

export default NotificationDelivery;
