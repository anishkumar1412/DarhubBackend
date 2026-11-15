import { OrderStatusEnum } from './enums.js';
import { getDayStatus } from './dateUtils.js';

/** A booking in one of these statuses is over for the pilot (the farmer or admin cancelled it). */
export const CLOSED_ORDER_STATUSES = [OrderStatusEnum.ORDER_CANCELLED, OrderStatusEnum.ORDER_REJECTED];

// ─────────────────────────────────────────────────────────────────────────────
//  How one booking looks to ONE pilot
//
//  request_status  (what the pilot has answered)
//     PENDING   at least one of the pilot's days is still waiting for their answer
//     ACCEPTED  every day that is not declined has been accepted
//     DECLINED  the pilot declined all of their days
//     CANCELLED the booking was cancelled/rejected (by the farmer or admin)
//
//  mission_state   (as soon as the pilot has accepted at least one day)
//     UPCOMING             accepted, no day currently running
//     ACTIVE               a working day is started and not yet ended
//     PENDING_VERIFICATION all accepted days finished, waiting for admin verification
//     COMPLETED            all accepted days finished and verified
//     CANCELLED            the booking was cancelled
//
//  The two are independent on purpose: when the admin adds a new day to a booking the pilot already accepted,
//  request_status goes back to PENDING (the new day needs an answer) while mission_state stays as it was, so the
//  pilot can still see, start and end the days they have already accepted.
// ─────────────────────────────────────────────────────────────────────────────
export const deriveStates = (order, dayStatuses, logs) => {
  if (CLOSED_ORDER_STATUSES.includes(order.order_status)) {
    return { request_status: 'CANCELLED', mission_state: 'CANCELLED' };
  }

  const pending = dayStatuses.filter((s) => s === 'scheduled').length;
  const accepted = dayStatuses.filter((s) => ['confirmed', 'started', 'completed'].includes(s)).length;

  let request_status;
  if (pending > 0) request_status = 'PENDING';
  else if (accepted > 0) request_status = 'ACCEPTED';
  else request_status = 'DECLINED';

  let mission_state = null;
  if (accepted > 0) {
    if (dayStatuses.includes('started')) {
      mission_state = 'ACTIVE';
    } else {
      const worked = logs.filter((l, i) => dayStatuses[i] !== 'declined');
      const allDone = pending === 0 && worked.length > 0 && worked.every((l) => getDayStatus(l) === 'completed');
      if (allDone) mission_state = worked.every((l) => l.is_verified === true) ? 'COMPLETED' : 'PENDING_VERIFICATION';
      else mission_state = 'UPCOMING';
    }
  }
  return { request_status, mission_state };
};

