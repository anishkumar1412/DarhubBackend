import { z, text, optionalText, optional, integer, booleanish } from './common.js';

const CATEGORIES = ['booking', 'work', 'system'];

// POST /api/notifications/devices
export const registerDeviceSchema = z.object({
  fcm_token: text('fcm_token', { max: 512, min: 20 }),
  app: z.enum(['farmer', 'pilot'], { errorMap: () => ({ message: 'app must be "farmer" or "pilot"' }) }),
  platform: optional(z.enum(['android', 'ios'], { errorMap: () => ({ message: 'platform must be "android" or "ios"' }) })),
  device_id: optionalText('device_id', { max: 128 }),
  device_name: optionalText('device_name', { max: 120 }),
  app_version: optionalText('app_version', { max: 32 }),
  os_version: optionalText('os_version', { max: 32 }),
  locale: optionalText('locale', { max: 16 }),
});

// POST /api/notifications/devices/unregister
export const unregisterDeviceSchema = z.object({ fcm_token: text('fcm_token', { max: 512, min: 20 }) });

// GET /api/notifications
export const listNotificationsQuery = z.object({
  limit: optional(integer('limit', { min: 1, max: 50 })),
  before: optionalText('before', { max: 200 }),          // cursor from the previous page (next_cursor)
  unread_only: optional(booleanish('unread_only')),
});

// PUT /api/notifications/preferences
export const updatePreferencesSchema = z.object({
  preferences: z.array(z.object({
    category: z.enum(CATEGORIES, { errorMap: () => ({ message: `category must be one of ${CATEGORIES.join(', ')}` }) }),
    push_enabled: booleanish('push_enabled'),
  })).min(1, 'preferences must have at least one entry').max(CATEGORIES.length),
});

// POST /api/notifications/admin/send (admin only)
export const adminSendSchema = z.object({
  user_id: integer('user_id', { min: 1 }),
  title: text('title', { max: 200 }),
  body: text('body', { max: 1000 }),
  screen: optionalText('screen', { max: 40 }),
  booking_id: optionalText('booking_id', { max: 64 }),
});
