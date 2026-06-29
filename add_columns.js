import db from './models/index.js';

const run = async () => {
  try {
    console.log('Running raw queries...');
    await db.sequelize.query('ALTER TABLE "MAINTENANCE_LOG" ADD COLUMN IF NOT EXISTS "sales_order_id" INTEGER;');
    await db.sequelize.query('ALTER TABLE "MAINTENANCE_LOG" ADD COLUMN IF NOT EXISTS "pilot_task_id" INTEGER;');
    await db.sequelize.query('ALTER TABLE "SALES_ORDER" ADD COLUMN IF NOT EXISTS "maintenance_log_id" INTEGER;');
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};
run();
