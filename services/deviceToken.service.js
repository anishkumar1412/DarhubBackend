/**
 * Registering and removing the phones that can receive pushes.
 *
 * The app calls registerDevice() at start-up, after login, and whenever FCM hands it a new token. It is an upsert
 * keyed on the token, so calling it again and again is harmless.
 */
import db from '../models/index.js';

const { Op } = db;
const MAX_ACTIVE_DEVICES_PER_USER = 10;

/**
 * @param {number} userId  the signed-in user (from the access token, never from the body)
 * @param {{ fcm_token: string, app: 'farmer'|'pilot', platform?: string, device_id?: string, device_name?: string,
 *           app_version?: string, os_version?: string, locale?: string }} device
 */
export const registerDevice = async (userId, device) => {
  const now = new Date();
  return db.sequelize.transaction(async (t) => {
    const fields = {
      user_id: userId,
      app: device.app,
      platform: device.platform || 'android',
      device_id: device.device_id || null,
      device_name: device.device_name || null,
      app_version: device.app_version || null,
      os_version: device.os_version || null,
      locale: device.locale || null,
      is_active: true,
      failure_count: 0,
      last_failure_at: null,
      last_failure_reason: null,
      last_seen_at: now,
      modified_on: now,
    };

    // One row per token. If the token was registered by someone else (another account on the same phone, a resold
    // phone) it moves to the current user: pushes follow whoever is logged in on the device.
    const existing = await db.DeviceToken.findOne({ where: { fcm_token: device.fcm_token }, transaction: t, lock: t.LOCK.UPDATE });
    let row;
    if (existing) {
      await existing.update(fields, { transaction: t });
      row = existing;
    } else {
      row = await db.DeviceToken.create({ ...fields, fcm_token: device.fcm_token, created_on: now }, { transaction: t });
    }

    // The same install with a rotated token: the older token is dead, retire it right away
    if (device.device_id) {
      await db.DeviceToken.update(
        { is_active: false, modified_on: now, last_failure_reason: 'replaced' },
        { where: { user_id: userId, device_id: device.device_id, id: { [Op.ne]: row.id }, is_active: true }, transaction: t },
      );
    }

    // A cap per user stops a misbehaving client from growing the table without bound: keep the newest devices
    const active = await db.DeviceToken.findAll({
      where: { user_id: userId, is_active: true }, order: [['last_seen_at', 'DESC']], attributes: ['id'], transaction: t, raw: true,
    });
    if (active.length > MAX_ACTIVE_DEVICES_PER_USER) {
      await db.DeviceToken.update(
        { is_active: false, modified_on: now, last_failure_reason: 'device-limit' },
        { where: { id: active.slice(MAX_ACTIVE_DEVICES_PER_USER).map((d) => d.id) }, transaction: t },
      );
    }
    return row;
  });
};

/** Logout: this phone stops receiving this user's notifications. Only the owner can switch their own token off. */
export const unregisterDevice = async (userId, fcmToken) => {
  const [count] = await db.DeviceToken.update(
    { is_active: false, last_failure_reason: 'logout', modified_on: new Date() },
    { where: { user_id: userId, fcm_token: fcmToken, is_active: true } },
  );
  return count;
};
