/**
 * TextBee (https://textbee.dev) SMS gateway: your own Android phone + SIM sends the text.
 *
 * Setup (once): create a TextBee account, install the TextBee Android app, register the phone (QR code), create an
 * API key in the dashboard, then set in .env:  SMS_PROVIDER=textbee  TEXTBEE_API_KEY=...  (see .env.example).
 * The phone must stay online with the app running. Free plan: 1 device, 50 SMS a day, 300 a month.
 *
 * POST {baseUrl}/api/v1/gateway/send-sms   header x-api-key   body { recipients: ["+91..."], message, deviceId? }
 */
import { SmsError } from '../utils/smsError.js';

const SEND_PATH = '/api/v1/gateway/send-sms';

/**
 * 10-digit national numbers (what registration stores) become E.164 with the default country code.
 * Also accepts +91XXXXXXXXXX, 91XXXXXXXXXX and 0XXXXXXXXXX.
 */
export const toE164 = (mobile, countryCode = '+91') => {
  const digits = String(mobile ?? '').replace(/[^\d]/g, '');
  const ccDigits = countryCode.replace(/[^\d]/g, '');
  if (String(mobile ?? '').trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+${ccDigits}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+${ccDigits}${digits.slice(1)}`;
  if (digits.startsWith(ccDigits) && digits.length === ccDigits.length + 10) return `+${digits}`;
  throw new SmsError('SMS_INVALID_NUMBER', 'The mobile number cannot be turned into an international number.');
};

/**
 * Sends one SMS through TextBee. Resolves with { batchId } or throws an [SmsError]:
 *   SMS_GATEWAY_AUTH          the API key was refused (401/403)
 *   SMS_GATEWAY_RATE_LIMITED  daily/monthly plan limit or too many requests (429)
 *   SMS_GATEWAY_TIMEOUT       TextBee did not answer in time
 *   SMS_GATEWAY_FAILED        any other failure (network, 4xx/5xx, success:false)
 *
 * @param {string} mobile
 * @param {string} message
 * @param {{ apiKey: string, baseUrl?: string, deviceId?: string, timeoutMs?: number, countryCode?: string }} config
 * @param {typeof fetch} [fetchImpl] replaceable for tests
 */
export const sendTextbeeSms = async (mobile, message, config, fetchImpl = fetch) => {
  if (!config?.apiKey) throw new SmsError('SMS_NOT_CONFIGURED', 'TEXTBEE_API_KEY is not set.');
  const url = `${(config.baseUrl || 'https://api.textbee.dev').replace(/\/+$/, '')}${SEND_PATH}`;
  const body = {
    recipients: [toE164(mobile, config.countryCode)],
    message,
    ...(config.deviceId && { deviceId: config.deviceId }),
  };

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new SmsError('SMS_GATEWAY_TIMEOUT', 'TextBee did not answer in time. Is the phone online with the TextBee app running?');
    }
    throw new SmsError('SMS_GATEWAY_FAILED', `Could not reach TextBee (${err?.cause?.code || err?.message || 'network error'}).`);
  }

  const payload = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new SmsError('SMS_GATEWAY_AUTH', 'TextBee rejected the API key (TEXTBEE_API_KEY).');
  }
  if (response.status === 429) {
    throw new SmsError('SMS_GATEWAY_RATE_LIMITED', 'TextBee limit reached (the free plan allows 50 SMS a day).');
  }
  const data = payload?.data ?? payload;
  if (!response.ok || data?.success === false || payload?.success === false) {
    const reason = payload?.message || data?.message || `HTTP ${response.status}`;
    throw new SmsError('SMS_GATEWAY_FAILED', `TextBee could not send the SMS: ${Array.isArray(reason) ? reason.join(', ') : reason}`);
  }
  return { batchId: data?.smsBatchId ?? null };
};
