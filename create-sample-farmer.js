import db from './models/index.js';
import bcrypt from 'bcryptjs';

async function checkPass() {
  try {
    const [results] = await db.sequelize.query(`SELECT email, password FROM "USER" WHERE id = 160`);
    if (results.length > 0) {
      const match = await bcrypt.compare('password123', results[0].password);
      console.log('Match:', match);
      console.log('Email:', results[0].email);
    }
  } catch(e) {}
  process.exit(0);
}
checkPass();
