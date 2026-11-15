/**
 * Booking price rules. The server is the only place a price is calculated: the apps display what /order/quote and
 * /order/create-order return, and the client's own price / tax / total are never trusted.
 */
import { IST_TIMEZONE, todayIST, toYMD } from './dateUtils.js';

export const ORDER_TAX_RATE = Number(process.env.ORDER_TAX_RATE ?? 0.05);

/** Farmers cannot book the same day once this IST time (HH:MM) has passed: a drone can't be arranged any more. */
export const SAME_DAY_BOOKING_CUTOFF = /^([01]\d|2[0-3]):[0-5]\d$/.test(process.env.SAME_DAY_BOOKING_CUTOFF || '')
  ? process.env.SAME_DAY_BOOKING_CUTOFF
  : '15:00';

export const roundMoney = (value) => Math.round(value * 100) / 100;

/** price = rate x acres, tax on top, total = price + tax - discount. Everything rounded to paise. */
export const calculatePrice = (ratePerAcre, acres, { discount = 0, taxRate = ORDER_TAX_RATE } = {}) => {
  const price = roundMoney(Number(ratePerAcre || 0) * acres);
  const tax = roundMoney(price * taxRate);
  return { price, tax, discount, total_price: roundMoney(price + tax - discount) };
};

/** Current India time as "HH:MM" (the server's own timezone and the phone's clock are both irrelevant). */
const istTimeOfDay = (now) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: IST_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);

/** True when a same-day booking can no longer be taken (checked by the server, not by the phone's clock). */
export const sameDayBookingClosed = (now = new Date()) => istTimeOfDay(now) >= SAME_DAY_BOOKING_CUTOFF;

/** Message for a farmer booking today after the cutoff, or null when the date is fine. Admins are exempt. */
export const sameDayBookingProblem = (startDate, now = new Date()) =>
  toYMD(startDate) === todayIST(now) && sameDayBookingClosed(now)
    ? `Same-day booking closes at ${SAME_DAY_BOOKING_CUTOFF} (India time). The earliest available date is tomorrow.`
    : null;
