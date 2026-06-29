import db from './models/index.js';

const syncDb = async () => {
  try {
    console.log('Syncing database...');
    // Alter true allows adding new columns
    await db.sequelize.sync({ alter: true });
    console.log('Database synced successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error syncing database:', error);
    process.exit(1);
  }
};

syncDb();
