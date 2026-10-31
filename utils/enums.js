export const OrderStatusEnum = {
  ORDER_PLACED: 'ORDER_PLACED',
  WAITING_FOR_CONFIRMATION: 'WAITING_FOR_CONFIRMATION',
  ORDER_ACCEPTED: 'ORDER_ACCEPTED',
  ORDER_STARTED: 'ORDER_STARTED',
  JOB_STARTED: 'JOB_STARTED',
  JOB_ENDED: 'JOB_ENDED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  WAITING_FOR_PAYMENT: 'WAITING_FOR_PAYMENT',
  PAYMENT_SUCCESSFUL: 'PAYMENT_SUCCESSFUL',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_REJECTED: 'ORDER_REJECTED'
};


/**
 * Order statuses in which a pilot may start a working day that they have already confirmed.
 * WAITING_FOR_CONFIRMATION is included on purpose: the admin adding one more day to a running booking moves
 * the order back to it, and that must not block the days the pilot already accepted. The per-day
 * confirmation (`is_pilot_confirmed`) is what actually gates a day.
 */
export const PILOT_STARTABLE_ORDER_STATUSES = [
  OrderStatusEnum.ORDER_ACCEPTED,
  OrderStatusEnum.ORDER_STARTED,
  OrderStatusEnum.JOB_STARTED,
  OrderStatusEnum.JOB_ENDED,
  OrderStatusEnum.WAITING_FOR_CONFIRMATION,
];
