import express from 'express';
import { authenticateUser, requireAdminRole } from '../middleware/access.js';
import { validate } from '../middleware/validate.js';
import { uuidParam } from '../validation/common.js';
import {
  registerDeviceSchema, unregisterDeviceSchema, listNotificationsQuery, updatePreferencesSchema, adminSendSchema,
} from '../validation/notification.schemas.js';
import {
  registerDeviceHandler, unregisterDeviceHandler, listNotifications, unreadCount, markRead, markAllRead,
  getPreferences, updatePreferences, adminSend,
} from '../controllers/notification.controller.js';

const notificationRouter = express.Router();

// Farmers and pilots (and admins) all use the same inbox; each only ever sees their own rows
notificationRouter.use(authenticateUser);

notificationRouter.post('/devices', validate({ body: registerDeviceSchema }), registerDeviceHandler);
notificationRouter.post('/devices/unregister', validate({ body: unregisterDeviceSchema }), unregisterDeviceHandler);

notificationRouter.get('/unread-count', unreadCount);
notificationRouter.post('/read-all', markAllRead);
notificationRouter.get('/preferences', getPreferences);
notificationRouter.put('/preferences', validate({ body: updatePreferencesSchema }), updatePreferences);
notificationRouter.post('/admin/send', requireAdminRole, validate({ body: adminSendSchema }), adminSend);

notificationRouter.get('/', validate({ query: listNotificationsQuery }), listNotifications);
notificationRouter.post('/:id/read', validate({ params: uuidParam('id', 'id') }), markRead);

export default notificationRouter;
