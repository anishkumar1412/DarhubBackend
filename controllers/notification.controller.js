/**
 * The notification API used by both apps (and one admin endpoint for testing).
 *
 *   POST /api/notifications/devices               register / refresh this phone's FCM token
 *   POST /api/notifications/devices/unregister    logout: stop pushes to this phone
 *   GET  /api/notifications                       my inbox, newest first, cursor pagination
 *   GET  /api/notifications/unread-count          the badge number
 *   POST /api/notifications/:id/read              mark one read
 *   POST /api/notifications/read-all              mark everything read
 *   GET  /api/notifications/preferences           what I have muted
 *   PUT  /api/notifications/preferences           mute / unmute a category
 *   POST /api/notifications/admin/send            admin: send a message to one user (testing, announcements)
 *
 * Every route needs a signed-in user and only ever touches that user's own rows: the user id comes from the access
 * token, never from the request.
 */
import db from '../models/index.js';
import { respondWithError } from '../middleware/errorHandler.js';
import { ApiError } from '../utils/apiError.js';
import { registerDevice, unregisterDevice } from '../services/deviceToken.service.js';
import { notifyUsers } from '../services/notification.service.js';
import { processPendingDeliveries } from '../services/notificationDispatcher.js';
import { NotificationType } from '../utils/notificationTypes.js';

const { Op } = db;
const CATEGORIES = ['booking', 'work', 'system'];

const toDto = (n) => ({
  id: n.id,
  type: n.type,
  category: n.category,
  title: n.title,
  body: n.body,
  data: n.data || {},
  is_read: n.read_at !== null && n.read_at !== undefined,
  read_at: n.read_at,
  created_at: n.created_on,
});

// The cursor is "<created_on ISO>|<id>": keyset pagination stays fast and stable while new rows keep arriving
const encodeCursor = (n) => Buffer.from(`${new Date(n.created_on).toISOString()}|${n.id}`).toString('base64url');
const decodeCursor = (cursor) => {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()) || !id) return null;
    return { date, id };
  } catch {
    return null;
  }
};

export const registerDeviceHandler = async (req, res) => {
  try {
    const row = await registerDevice(req.auth.id, req.valid.body);
    return res.status(200).json({ success: true, message: 'Device registered', data: { device_id: row.id } });
  } catch (error) {
    return respondWithError(req, res, error, 'registerDevice');
  }
};

export const unregisterDeviceHandler = async (req, res) => {
  try {
    await unregisterDevice(req.auth.id, req.valid.body.fcm_token);
    return res.status(200).json({ success: true, message: 'Device unregistered' });   // idempotent: unknown token is not an error
  } catch (error) {
    return respondWithError(req, res, error, 'unregisterDevice');
  }
};

export const listNotifications = async (req, res) => {
  try {
    const { limit = 20, before, unread_only: unreadOnly } = req.valid.query;
    const where = { user_id: req.auth.id };
    if (unreadOnly) where.read_at = null;
    if (before) {
      const cursor = decodeCursor(before);
      if (!cursor) throw new ApiError(400, 'before is not a valid cursor');
      where[Op.or] = [
        { created_on: { [Op.lt]: cursor.date } },
        { created_on: cursor.date, id: { [Op.lt]: cursor.id } },
      ];
    }
    const rows = await db.Notification.findAll({
      where, order: [['created_on', 'DESC'], ['id', 'DESC']], limit: limit + 1, raw: true,
    });
    const page = rows.slice(0, limit);
    const unread = await db.Notification.count({ where: { user_id: req.auth.id, read_at: null } });
    return res.status(200).json({
      success: true,
      data: {
        items: page.map(toDto),
        unread_count: unread,
        next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
      },
    });
  } catch (error) {
    return respondWithError(req, res, error, 'listNotifications');
  }
};

export const unreadCount = async (req, res) => {
  try {
    const count = await db.Notification.count({ where: { user_id: req.auth.id, read_at: null } });
    return res.status(200).json({ success: true, data: { unread_count: count } });
  } catch (error) {
    return respondWithError(req, res, error, 'unreadCount');
  }
};

export const markRead = async (req, res) => {
  try {
    // user_id in the WHERE: nobody can mark (or probe) another person's notification
    const [count] = await db.Notification.update(
      { read_at: new Date() },
      { where: { id: req.valid.params.id, user_id: req.auth.id, read_at: null } },
    );
    if (!count) {
      const exists = await db.Notification.count({ where: { id: req.valid.params.id, user_id: req.auth.id } });
      if (!exists) throw new ApiError(404, 'Notification not found');
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    return respondWithError(req, res, error, 'markRead');
  }
};

export const markAllRead = async (req, res) => {
  try {
    const [count] = await db.Notification.update({ read_at: new Date() }, { where: { user_id: req.auth.id, read_at: null } });
    return res.status(200).json({ success: true, data: { updated: count } });
  } catch (error) {
    return respondWithError(req, res, error, 'markAllRead');
  }
};

export const getPreferences = async (req, res) => {
  try {
    const rows = await db.NotificationPreference.findAll({ where: { user_id: req.auth.id }, raw: true });
    const byCategory = new Map(rows.map((r) => [r.category, r.push_enabled]));
    return res.status(200).json({
      success: true,
      data: { preferences: CATEGORIES.map((category) => ({ category, push_enabled: byCategory.get(category) ?? true })) },
    });
  } catch (error) {
    return respondWithError(req, res, error, 'getPreferences');
  }
};

export const updatePreferences = async (req, res) => {
  try {
    await db.sequelize.transaction(async (t) => {
      for (const { category, push_enabled: pushEnabled } of req.valid.body.preferences) {
        const [row, created] = await db.NotificationPreference.findOrCreate({
          where: { user_id: req.auth.id, category }, defaults: { push_enabled: pushEnabled, modified_on: new Date() }, transaction: t,
        });
        if (!created) await row.update({ push_enabled: pushEnabled, modified_on: new Date() }, { transaction: t });
      }
    });
    return getPreferences(req, res);
  } catch (error) {
    return respondWithError(req, res, error, 'updatePreferences');
  }
};

/** Admin only: send a message to one user (to test a phone, or for a one-off announcement). */
export const adminSend = async (req, res) => {
  try {
    const { user_id: userId, title, body, screen, booking_id: bookingId } = req.valid.body;
    if (!(await db.User.findByPk(userId, { attributes: ['id'] }))) throw new ApiError(404, 'User not found');
    const created = await notifyUsers({ userIds: [userId], type: NotificationType.ADMIN_MESSAGE, vars: { title, body, screen, booking_id: bookingId } });
    const devices = await db.DeviceToken.count({ where: { user_id: userId, is_active: true } });
    // Send now instead of waiting for the poll, and report what happened to this user's deliveries
    await processPendingDeliveries();
    // Only this send's deliveries (notifications created in the last minute), and none at all when there is no device
    const deliveries = devices === 0 ? [] : await db.NotificationDelivery.findAll({
      include: [{
        model: db.Notification, as: 'notification', attributes: [],
        where: { user_id: userId, type: NotificationType.ADMIN_MESSAGE, created_on: { [Op.gt]: new Date(Date.now() - 60 * 1000) } },
      }],
      order: [['id', 'DESC']], limit: devices, attributes: ['status', 'error_code', 'attempts'], raw: true,
    });
    return res.status(200).json({ success: true, data: { notifications_created: created, active_devices: devices, deliveries } });
  } catch (error) {
    return respondWithError(req, res, error, 'adminSend');
  }
};
