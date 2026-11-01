import env from '../config/env.js';
import logger from '../utils/logger.js';
import { SmsError } from '../utils/smsError.js';
import { sendTextbeeSms } from './textbee.service.js';

/**
 * SMS delivery. Pick the gateway with SMS_PROVIDER:
 *
 *  - console   prints the message to the server log (development only)
 *  - textbee   your own Android phone + SIM sends it through TextBee (services/textbee.service.js, TEXTBEE_* settings)
 *  - none      nothing can be sent: callers must not claim an SMS went out
 *
 * To add another gateway: write its send function in its own file, add its name to SMS_PROVIDER in config/env.js and
 * one branch in `deliver` below.
 */
export { SmsError };

/** True when a mobile OTP can actually reach the user. */
export const isSmsConfigured = () => env.SMS_PROVIDER !== 'none';

const deliver = async (mobile, message) => {
  if (env.SMS_PROVIDER === 'console') {
    logger.info(`
📱 [SMS - console provider] To: ${mobile}
${message}
`);
    return;
  }
  if (env.SMS_PROVIDER === 'textbee') {
    const { batchId } = await sendTextbeeSms(mobile, message, {
      ...env.TEXTBEE,
      countryCode: env.SMS_DEFAULT_COUNTRY_CODE,
    });
    // The recipient is masked and the text (it holds the code) is never logged
    logger.info(`[SMS] TextBee accepted a message for ***${String(mobile).slice(-4)} (batch ${batchId ?? 'n/a'}).`);
    return;
  }
  throw new SmsError('SMS_NOT_CONFIGURED', 'No SMS gateway is configured on this server.');
};

export const sendOtpSms = (mobile, otp, expiryMinutes = 3) =>
  deliver(mobile, `Your DARHUB verification code is ${otp}. It is valid for ${expiryMinutes} minutes. Do not share it with anyone.`);
