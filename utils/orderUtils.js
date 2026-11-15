import db from '../models/index.js';
import { OrderStatusEnum } from './enums.js';
import { onOrderStatusChanged } from '../services/notificationEvents.js';

/**
 * Updates the order status and inserts a record into the timeline.
 * @param {string} booking_id - The ID of the spraying order.
 * @param {string} order_status - The new status from OrderStatusEnum.
 * @param {string} remarks - Optional remarks for the timeline entry.
 * @param {number} user_id - The ID of the user performing the action (for created_by).
 * @param {import('sequelize').Transaction} [externalTransaction] - Join the caller's transaction instead of
 *   opening our own, so the status change commits or rolls back together with the caller's other writes.
 */
export const updateOrderStatus = async (booking_id, order_status, remarks = '', user_id = null, externalTransaction = null) => {
  const ownsTransaction = !externalTransaction;
  const t = externalTransaction ?? await db.sequelize.transaction();
  try {
    const order = await db.SprayingOrder.findOne({ where: { booking_id }, transaction: t });
    
    if (!order) {
      throw new Error(`Order not found for booking_id: ${booking_id}`);
    }

    if (order.order_status !== order_status) {
      await order.update({ order_status }, { transaction: t });

      const timeline = await db.SprayingOrderTimeline.create({
        booking_id,
        order_status,
        remarks,
        created_by: user_id
      }, { transaction: t });

      // Tell the people concerned (written in this same transaction; never throws, see services/notificationEvents.js)
      await onOrderStatusChanged({
        order, status: order_status, eventId: timeline.timeline_id, actorId: user_id, reason: remarks, transaction: t,
      });
    }

    if (ownsTransaction) await t.commit();
    return order;
  } catch (error) {
    if (ownsTransaction) await t.rollback();
    throw error;
  }
};
