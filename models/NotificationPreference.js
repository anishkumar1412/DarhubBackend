/** What a user has switched off, per category. No row means "on". Critical categories ignore it (see notificationTemplates.js). */
const NotificationPreference = (sequelize, DataTypes) => sequelize.define('NotificationPreference', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  category: { type: DataTypes.STRING(32), allowNull: false },
  push_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  modified_on: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'NOTIFICATION_PREFERENCE',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['user_id', 'category'], name: 'notification_preference_user_category_uq' },
  ],
});

export default NotificationPreference;
