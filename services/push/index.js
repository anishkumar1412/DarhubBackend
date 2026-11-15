import env from '../../config/env.js';
import { consoleProvider } from './providers/console.provider.js';
import { fcmProvider } from './providers/fcm.provider.js';

let override;
/** Tests only: replace the provider (pass undefined to restore the configured one). */
export const setPushProviderForTests = (provider) => { override = provider; };

/** The active push provider (NOTIFICATION_PROVIDER). `none` has no provider: the inbox still works, nothing is pushed. */
export const getPushProvider = () => {
  if (override !== undefined) return override;
  switch (env.NOTIFICATION_PROVIDER) {
    case 'fcm': return fcmProvider;
    case 'console': return consoleProvider;
    default: return null;
  }
};

export const isPushEnabled = () => getPushProvider() !== null;
