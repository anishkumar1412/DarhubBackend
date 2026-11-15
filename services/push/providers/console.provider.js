/** Development provider: prints what would be sent and reports success. Nothing leaves the machine. */
import logger from '../../../utils/logger.js';

export const consoleProvider = {
  name: 'console',
  async send(messages) {
    return messages.map((m, i) => {
      logger.info(`[push:console] -> ${String(m.token).slice(0, 12)}…  "${m.notification.title}": ${m.notification.body}  data=${JSON.stringify(m.data)}`);
      return { ok: true, messageId: `console-${Date.now()}-${i}` };
    });
  },
};
