import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * SMS delivery. No gateway (MSG91, Twilio, ...) is connected yet, so this is the single place to plug one in.
 *
 *  - SMS_PROVIDER=console  prints the message to the server log (development only)
 *  - SMS_PROVIDER=none     nothing can be sent: callers must not claim an SMS went out
 *
 * To add a real gateway: implement the call in `deliver` and allow its name in config/env.js.
 */
export class SmsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SmsError';
    this.code = code;
  }
}

/** True when a mobile OTP can actually reach the user. */
export const isSmsConfigured = () => env.SMS_PROVIDER !== 'none';

const deliver = async (mobile, message) => {
  if (env.SMS_PROVIDER === 'console') {
    logger.info(`\n📱 [SMS - console provider] To: ${mobile}\n${message}\n`);
    return;
  }
  throw new SmsError('SMS_NOT_CONFIGURED', 'No SMS gateway is configured on this server.');
};

export const sendOtpSms = (mobile, otp, expiryMinutes = 3) =>
  deliver(mobile, `Your DARHUB verification code is ${otp}. It is valid for ${expiryMinutes} minutes. Do not share it with anyone.`);
