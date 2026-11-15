import db from './models/index.js';

const fixConstraint = async () => {
  try {
    await db.sequelize.query(`
      ALTER TABLE "SPRAYING_ORDER"
      ADD CONSTRAINT "unique_booking_id" UNIQUE ("booking_id");
    `);
    console.log('Unique constraint added to booking_id successfully.');
  } catch (error) {
    console.error('Error adding unique constraint:', error);
  } finally {
    process.exit(0);
  }
};

fixConstraint();
