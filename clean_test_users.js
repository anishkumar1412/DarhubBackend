import db from "./models/index.js";

const cleanTestUsers = async () => {
  try {
    await db.sequelize.authenticate();
    console.log("Connected to the database successfully.");

    // Find users matching test email patterns (ends with example.com or contains "test")
    const testUsers = await db.User.findAll({
      where: {
        [db.Sequelize.Op.or]: [
          { email: { [db.Sequelize.Op.iLike]: '%example.com' } },
          { email: { [db.Sequelize.Op.iLike]: '%alkab%' } },
          { email: 'alkabrza61@gmail.com' },
          { mobile_number: '8102848501' }
        ]
      }
    });

    console.log(`Found ${testUsers.length} test user(s) to clean up.`);

    for (const user of testUsers) {
      console.log(`Cleaning up User ID ${user.id} (${user.email})...`);

      // Delete in a transaction to maintain integrity
      await db.sequelize.transaction(async (t) => {
        await db.UserRole.destroy({ where: { user_id: user.id }, transaction: t });
        await db.UserProfile.destroy({ where: { user_id: user.id }, transaction: t });
        await db.UserAddress.destroy({ where: { user_id: user.id }, transaction: t });
        await db.UserBankDetails.destroy({ where: { user_id: user.id }, transaction: t });
        await db.UserUpiDetails.destroy({ where: { user_id: user.id }, transaction: t });
        await db.UserDocuments.destroy({ where: { user_id: user.id }, transaction: t });
        await db.OtpVerification.destroy({
          where: {
            [db.Sequelize.Op.or]: [
              { email: user.email },
              { mobile_number: user.mobile_number }
            ]
          },
          transaction: t
        });
        await db.User.destroy({ where: { id: user.id }, transaction: t });
      });
      console.log(`Cleaned User ID ${user.id}.`);
    }

    console.log("Cleanup complete!");
    process.exit(0);
  } catch (error) {
    console.error("Cleanup failed:", error);
    process.exit(1);
  }
};

cleanTestUsers();
