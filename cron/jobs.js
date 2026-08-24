import cron from 'node-cron';
import db from '../models/index.js';
import { OrderStatusEnum } from '../utils/enums.js';
import { updateOrderStatus } from '../utils/orderUtils.js';

export const initCronJobs = () => {
  // Run every day at 23:59 to mark ongoing daily logs as ended
  cron.schedule('59 23 * * *', async () => {
    console.log('Running daily cron job to end jobs for the day...');
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const logs = await db.SprayingDailyLogs.findAll({
        where: {
          working_date: today,
        },
      });

      for (const log of logs) {
        let logData = {};
        try {
          if (log.verification_comment) {
            logData = JSON.parse(log.verification_comment);
          }
        } catch (e) {
          logData = {};
        }

        if (logData.day_status !== 'completed') {
          logData.day_status = 'completed';
          logData.cron_ended = true;

          await log.update({
            verification_comment: JSON.stringify(logData),
            modified_on: new Date(),
          });

          // Check if all logs for this booking are completed
          const allLogs = await db.SprayingDailyLogs.findAll({
            where: { spraying_work_id: log.spraying_work_id },
          });

          const allDaysComplete = allLogs.every(l => {
            try {
              const data = JSON.parse(l.verification_comment || "{}");
              return data.day_status === "completed";
            } catch { return false; }
          });

          // Add timeline entry for Job Ended for this day
          await updateOrderStatus(log.spraying_work_id, OrderStatusEnum.JOB_ENDED, "Job ended by system cron for the day");

          if (allDaysComplete && allLogs.length > 0) {
            await updateOrderStatus(log.spraying_work_id, OrderStatusEnum.ORDER_COMPLETED, "All days completed by pilot (System Cron)");
          }
        }
      }
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  });
};
