/**
 * What every notification says, who it is for and how it behaves. Adding a notification = adding one entry here
 * and calling notifyUsers() from the place the event happens (docs/PUSH_NOTIFICATIONS.md, "Adding a new notification").
 *
 *  category  booking | work | system: what a user can mute in Settings
 *  critical  true = the user's mute setting is ignored (cancellations, schedule changes: acting late costs money)
 *  priority  FCM delivery priority: `high` wakes a sleeping phone, `normal` waits for the next wake-up
 *  ttlHours  how long the push stays useful; after that the worker drops it instead of showing a stale message
 *  text      { en, hi } -> (vars) => { title, body }
 *  data      (vars) => ids the app needs to open the right screen (all values become strings in FCM)
 */
import { NotificationCategory as C, NotificationType as T } from '../utils/notificationTypes.js';

export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en', 'hi'];

/** "#3580ACCC": the same short id the apps show for a booking. */
export const shortId = (bookingId = '') => (String(bookingId).length > 12 ? `#${String(bookingId).slice(0, 8).toUpperCase()}` : String(bookingId));

const bookingData = (v) => ({ booking_id: v.booking_id, screen: 'BOOKING' });

export const TEMPLATES = {
  // ── Farmer ──────────────────────────────────────────────────────────────────
  [T.BOOKING_CONFIRMED]: {
    category: C.BOOKING, priority: 'normal', ttlHours: 48, data: bookingData,
    text: {
      en: (v) => ({ title: 'Booking received', body: `Your ${v.crop} spraying booking ${shortId(v.booking_id)} for ${v.dates} is confirmed. We will assign a pilot soon.` }),
      hi: (v) => ({ title: 'बुकिंग मिल गई', body: `आपकी ${v.crop} छिड़काव बुकिंग ${shortId(v.booking_id)} (${v.dates}) दर्ज हो गई है। जल्द ही पायलट तय किया जाएगा।` }),
    },
  },
  [T.PILOT_ASSIGNED]: {
    category: C.BOOKING, priority: 'high', ttlHours: 48, data: bookingData,
    text: {
      en: (v) => ({ title: 'Pilot assigned', body: `${v.pilot_name} will spray your ${v.crop} field on ${v.dates}.` }),
      hi: (v) => ({ title: 'पायलट तय हुआ', body: `${v.pilot_name} आपके ${v.crop} खेत में ${v.dates} को छिड़काव करेंगे।` }),
    },
  },
  [T.BOOKING_ACCEPTED]: {
    category: C.BOOKING, priority: 'high', ttlHours: 48, data: bookingData,
    text: {
      en: (v) => ({ title: 'Your booking is confirmed', body: `The pilot accepted booking ${shortId(v.booking_id)}. Spraying is planned for ${v.dates}.` }),
      hi: (v) => ({ title: 'आपकी बुकिंग पक्की हुई', body: `पायलट ने बुकिंग ${shortId(v.booking_id)} स्वीकार कर ली है। छिड़काव ${v.dates} को होगा।` }),
    },
  },
  [T.JOB_STARTED]: {
    category: C.BOOKING, priority: 'high', ttlHours: 12, data: bookingData,
    text: {
      en: (v) => ({ title: 'Spraying has started', body: `The pilot has started spraying your ${v.crop} field.` }),
      hi: (v) => ({ title: 'छिड़काव शुरू हो गया', body: `पायलट ने आपके ${v.crop} खेत में छिड़काव शुरू कर दिया है।` }),
    },
  },
  [T.DAY_COMPLETED]: {
    category: C.BOOKING, priority: 'normal', ttlHours: 24, data: bookingData,
    text: {
      en: (v) => ({ title: 'Day’s spraying done', body: `Today’s work on booking ${shortId(v.booking_id)} is finished. The next day continues as scheduled.` }),
      hi: (v) => ({ title: 'आज का छिड़काव पूरा', body: `बुकिंग ${shortId(v.booking_id)} का आज का काम पूरा हो गया है। अगला दिन तय समय पर होगा।` }),
    },
  },
  [T.JOB_COMPLETED]: {
    category: C.BOOKING, priority: 'high', ttlHours: 72, data: bookingData,
    text: {
      en: (v) => ({ title: 'Spraying completed', body: `Your ${v.crop} spraying is complete. Please rate your experience.` }),
      hi: (v) => ({ title: 'छिड़काव पूरा हुआ', body: `आपके ${v.crop} का छिड़काव पूरा हो गया है। कृपया अपना अनुभव बताएं।` }),
    },
  },
  [T.BOOKING_CANCELLED]: {
    category: C.BOOKING, critical: true, priority: 'high', ttlHours: 72, data: bookingData,
    text: {
      en: (v) => ({ title: 'Booking cancelled', body: `Booking ${shortId(v.booking_id)} has been cancelled.${v.reason ? ` Reason: ${v.reason}` : ''}` }),
      hi: (v) => ({ title: 'बुकिंग रद्द हुई', body: `बुकिंग ${shortId(v.booking_id)} रद्द कर दी गई है।${v.reason ? ` कारण: ${v.reason}` : ''}` }),
    },
  },

  // ── Pilot ───────────────────────────────────────────────────────────────────
  [T.WORK_ASSIGNED]: {
    category: C.WORK, priority: 'high', ttlHours: 48, data: (v) => ({ booking_id: v.booking_id, screen: 'REQUESTS' }),
    text: {
      en: (v) => ({ title: 'New work assigned', body: `${v.crop}, ${v.acres} acres at ${v.village} on ${v.dates}. Open the app to accept it on the day.` }),
      hi: (v) => ({ title: 'नया काम मिला', body: `${v.crop}, ${v.acres} एकड़, ${v.village}, ${v.dates}। उसी दिन ऐप में स्वीकार करें।` }),
    },
  },
  [T.WORK_TODAY]: {
    category: C.WORK, priority: 'high', ttlHours: 14, data: (v) => ({ booking_id: v.booking_id, screen: 'REQUESTS' }),
    text: {
      en: (v) => ({ title: 'You have work today', body: `${v.crop}, ${v.acres} acres at ${v.village}. ${v.needs_accept ? 'Accept and start the day in the app.' : 'Start the day in the app.'}` }),
      hi: (v) => ({ title: 'आज आपका काम है', body: `${v.crop}, ${v.acres} एकड़, ${v.village}। ${v.needs_accept ? 'ऐप में काम स्वीकार करके दिन शुरू करें।' : 'ऐप में दिन शुरू करें।'}` }),
    },
  },
  [T.WORK_CANCELLED]: {
    category: C.WORK, critical: true, priority: 'high', ttlHours: 48, data: (v) => ({ booking_id: v.booking_id, screen: 'ORDERS' }),
    text: {
      en: (v) => ({ title: 'Work cancelled', body: `Booking ${shortId(v.booking_id)} was cancelled. You no longer need to go.` }),
      hi: (v) => ({ title: 'काम रद्द हुआ', body: `बुकिंग ${shortId(v.booking_id)} रद्द हो गई है। अब जाने की ज़रूरत नहीं।` }),
    },
  },
  [T.WORK_SCHEDULE_CHANGED]: {
    category: C.WORK, critical: true, priority: 'high', ttlHours: 48, data: (v) => ({ booking_id: v.booking_id, screen: 'REQUESTS' }),
    text: {
      en: (v) => ({ title: 'Schedule changed', body: `Booking ${shortId(v.booking_id)} now runs ${v.dates}. Check the app.` }),
      hi: (v) => ({ title: 'कार्यक्रम बदला', body: `बुकिंग ${shortId(v.booking_id)} अब ${v.dates} को है। ऐप देखें।` }),
    },
  },

  [T.WORK_UNASSIGNED]: {
    category: C.WORK, critical: true, priority: 'high', ttlHours: 48, data: (v) => ({ booking_id: v.booking_id, screen: 'ORDERS' }),
    text: {
      en: (v) => ({ title: 'Removed from a booking', body: `The farmer rescheduled booking ${shortId(v.booking_id)}. You are no longer assigned to it.` }),
      hi: (v) => ({ title: 'बुकिंग से हटाया गया', body: `किसान ने बुकिंग ${shortId(v.booking_id)} की तारीख बदल दी है। अब आप इससे जुड़े नहीं हैं।` }),
    },
  },

  // ── Admin / announcements ───────────────────────────────────────────────────
  [T.ADMIN_MESSAGE]: {
    category: C.SYSTEM, priority: 'normal', ttlHours: 72, data: (v) => ({ screen: v.screen || 'HOME', ...(v.booking_id ? { booking_id: v.booking_id } : {}) }),
    text: {
      en: (v) => ({ title: v.title, body: v.body }),
      hi: (v) => ({ title: v.title, body: v.body }),
    },
  },
};

/** Renders a template for a language (falls back to English); the text is trimmed to what the inbox columns hold. */
export const renderNotification = (type, vars = {}, language = DEFAULT_LANGUAGE) => {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`Unknown notification type: ${type}`);
  const render = template.text[language] || template.text[DEFAULT_LANGUAGE];
  const { title, body } = render(vars);
  return {
    category: template.category,
    critical: template.critical === true,
    priority: template.priority,
    ttlHours: template.ttlHours,
    title: String(title).slice(0, 200),
    body: String(body).slice(0, 1000),
    data: template.data ? template.data(vars) : {},
  };
};

/** "31 Oct" / "31 Oct – 2 Nov" from YYYY-MM-DD strings, the way the apps write dates. */
export const formatDateRange = (dates = []) => {
  const sorted = [...new Set(dates)].filter(Boolean).sort();
  if (!sorted.length) return '';
  const fmt = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return sorted.length === 1 || sorted[0] === sorted[sorted.length - 1] ? fmt(sorted[0]) : `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}`;
};
