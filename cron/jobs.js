import cron from 'node-cron';
import db from '../models/index.js';
import { OrderStatusEnum } from '../utils/enums.js';
import { updateOrderStatus } from '../utils/orderUtils.js';
import { IST_TIMEZONE, todayIST, parseDateOnly, readDayData, getDayStatus } from '../utils/dateUtils.js';

/**
 * Ends every working day that was started but never ended (today's, and any earlier one a missed run left behind).
 * Each day is closed in ONE transaction together with its order status, under a row lock:
 *  - if the order update fails, the day goes back to "started" and the next run retries it (it used to be marked
 *    completed first, so the order stayed JOB_STARTED forever);
 *  - a second instance (or a pilot ending the day at the same moment) waits for the lock and then sees the day is
 *    no longer "started", so nothing is closed or logged twice.
 * One failing day never stops the others. Returns the number of days closed.
 */
export const closeStartedDays = async () => {
  const today = parseDateOnly(todayIST());
  const candidates = await db.SprayingDailyLogs.findAll({
    where: { working_date: { [db.Op.lte]: today }, is_active: true },
    attributes: ['id'],
    raw: true,
  });

  let closed = 0;
  for (const { id } of candidates) {
    try {
      const didClose = await db.sequelize.transaction(async (t) => {
        const log = await db.SprayingDailyLogs.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!log || !log.is_active || getDayStatus(log) !== 'started') return false;

        const logData = readDayData(log);
        logData.day_status = 'completed';
        logData.cron_ended = true;
        logData.saved_at = new Date().toISOString();
        await log.update({ verification_comment: JSON.stringify(logData), modified_on: new Date() }, { transaction: t });

        const allLogs = await db.SprayingDailyLogs.findAll({
          where: { spraying_work_id: log.spraying_work_id, is_active: true },
          transaction: t,
        });
        const allDaysComplete = allLogs.length > 0 && allLogs.every((l) => getDayStatus(l) === 'completed');
        await updateOrderStatus(
          log.spraying_work_id,
          allDaysComplete ? OrderStatusEnum.ORDER_COMPLETED : OrderStatusEnum.JOB_ENDED,
          allDaysComplete ? 'All days completed (closed by system cron)' : 'Job ended by system cron for the day',
          null,
          t,
        );
        return true;
      });
      if (didClose) closed += 1;
    } catch (error) {
      console.error(`[cron] Could not close working day ${id}:`, error);
    }
  }
  return closed;
};

export const initCronJobs = () => {
  // Every night at 02:30 India time: one-time codes are useless after minutes; keep a day of them for support, drop the rest.
  cron.schedule('30 2 * * *', async () => {
    try {
      const removed = await db.OtpVerification.destroy({
        where: { created_on: { [db.Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (removed) console.log(`[cron] Removed ${removed} expired OTP records.`);
    } catch (error) {
      console.error('Error in OTP cleanup cron job:', error);
    }
    try {
      // Idempotency keys live 24 h; after that a retry is a new request anyway
      const purged = await db.IdempotencyKey.destroy({ where: { expires_at: { [db.Op.lt]: new Date() } } });
      if (purged) console.log(`[cron] Removed ${purged} expired idempotency keys.`);
    } catch (error) {
      console.error('Error in idempotency-key cleanup cron job:', error);
    }
  }, { timezone: IST_TIMEZONE });

  // Every day at 23:59 India time: close the days the pilot started but did not end.
  // Days that were never started are left alone (they are not "done").
  cron.schedule('59 23 * * *', async () => {
    console.log('Running daily cron job to end jobs for the day...');
    try {
      const closed = await closeStartedDays();
      if (closed) console.log(`[cron] Closed ${closed} working day(s) left running.`);
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  }, { timezone: IST_TIMEZONE });
};
