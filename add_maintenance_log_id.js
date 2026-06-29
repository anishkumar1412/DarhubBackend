import db from './models/index.js';

const run = async () => {
  try {
    console.log('Adding maintenance_log_id to PILOT_MAINTENANCE_ATTACHMENT...');
    await db.sequelize.query('ALTER TABLE "PILOT_MAINTENANCE_ATTACHMENT" ADD COLUMN IF NOT EXISTS "maintenance_log_id" INTEGER;');
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};
run();
