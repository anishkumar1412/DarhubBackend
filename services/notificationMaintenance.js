/** Housekeeping so the notification tables do not grow forever. Runs nightly (cron/jobs.js). */
import db from '../models/index.js';
import env from '../config/env.js';

const { Op } = db;
const DAY = 24 * 60 * 60 * 1000;

/**
 * - inbox rows older than NOTIFICATION_RETENTION_DAYS (their deliveries go with them: ON DELETE CASCADE)
 * - device tokens switched off more than 30 days ago
 * - device tokens that have not opened the app for 270 days (FCM treats a token unused for ~270 days as stale)
 */
export const purgeOldNotifications = async () => {
  const notifications = await db.Notification.destroy({
    where: { created_on: { [Op.lt]: new Date(Date.now() - env.NOTIFICATIONS.retentionDays * DAY) } },
  });
  const devices = await db.DeviceToken.destroy({
    where: {
      [Op.or]: [
        { is_active: false, modified_on: { [Op.lt]: new Date(Date.now() - 30 * DAY) } },
        { last_seen_at: { [Op.lt]: new Date(Date.now() - 270 * DAY) } },
      ],
    },
  });
  return { notifications, devices };
};
