import { Op } from 'sequelize';

/**
 * The notification INBOX: one row per notification per person, whether or not a push was sent.
 * It is what the app's notification list shows and what the unread badge counts. Pushes (NOTIFICATION_DELIVERY)
 * are only a way of telling the person that a row here exists.
 */
const Notification = (sequelize, DataTypes) => sequelize.define('Notification', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.STRING(64), allowNull: false },           // BOOKING_CONFIRMED, WORK_ASSIGNED ... (services/notificationTemplates.js)
  category: { type: DataTypes.STRING(32), allowNull: false },       // booking | work | system: what a user can mute
  title: { type: DataTypes.STRING(200), allowNull: false },
  body: { type: DataTypes.STRING(1000), allowNull: false },
  data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }, // booking_id and other ids the app needs to open the right screen
  priority: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'high' }, // high | normal (FCM delivery priority)
  dedupe_key: { type: DataTypes.STRING(160), allowNull: true },     // the same event can never notify the same person twice
  read_at: { type: DataTypes.DATE, allowNull: true },
  created_on: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  expires_at: { type: DataTypes.DATE, allowNull: true },            // a push still queued after this is dropped (stale reminders)
}, {
  tableName: 'NOTIFICATION',
  timestamps: false,
  indexes: [
    { fields: ['user_id', 'created_on', 'id'], name: 'notification_user_created_idx' },
    { fields: ['user_id'], where: { read_at: null }, name: 'notification_user_unread_idx' },
    { unique: true, fields: ['user_id', 'dedupe_key'], where: { dedupe_key: { [Op.ne]: null } }, name: 'notification_user_dedupe_uq' },
  ],
});

export default Notification;
