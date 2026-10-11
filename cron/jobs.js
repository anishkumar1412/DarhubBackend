import cron from 'node-cron';
import db from '../models/index.js';
import { OrderStatusEnum } from '../utils/enums.js';
import { updateOrderStatus } from '../utils/orderUtils.js';
import { IST_TIMEZONE, todayIST, parseDateOnly, readDayData, getDayStatus } from '../utils/dateUtils.js';

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
  }, { timezone: IST_TIMEZONE });

  // Every day at 23:59 India time: close the days the pilot started but did not end.
  // Days that were never started are left alone (they are not "done").
  cron.schedule('59 23 * * *', async () => {
    console.log('Running daily cron job to end jobs for the day...');
    try {
      const today = parseDateOnly(todayIST());

      const logs = await db.SprayingDailyLogs.findAll({
        where: {
          working_date: today,
          is_active: true,
        },
      });

      for (const log of logs) {
        if (getDayStatus(log) !== 'started') continue;

        const logData = readDayData(log);
        logData.day_status = 'completed';
        logData.cron_ended = true;
        logData.saved_at = new Date().toISOString();

        await log.update({
          verification_comment: JSON.stringify(logData),
          modified_on: new Date(),
        });

        const allLogs = await db.SprayingDailyLogs.findAll({
          where: { spraying_work_id: log.spraying_work_id, is_active: true },
        });
        const allDaysComplete =
          allLogs.length > 0 && allLogs.every(l => getDayStatus(l) === 'completed');

        if (allDaysComplete) {
          await updateOrderStatus(log.spraying_work_id, OrderStatusEnum.ORDER_COMPLETED, 'All days completed (closed by system cron)');
        } else {
          await updateOrderStatus(log.spraying_work_id, OrderStatusEnum.JOB_ENDED, 'Job ended by system cron for the day');
        }
      }
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  }, { timezone: IST_TIMEZONE });
};
