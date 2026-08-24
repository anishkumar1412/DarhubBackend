import { getFarmerProfile } from './controllers/farmerProfile.controller.js';
import db from './models/index.js';

async function test() {
  try {
    // Ensure DB is synced/connected
    await db.sequelize.authenticate();
    console.log("DB connected successfully.");

    // Find any user (preferably a farmer, user_type = 3)
    let user = await db.User.findOne({ where: { user_type: 3 } });
    if (!user) {
      console.log("No farmer user found, picking any user...");
      user = await db.User.findOne();
    }
    
    if (!user) {
      console.log("No user found in the database to test with.");
      process.exit(1);
    }
    
    console.log(`Testing with User ID: ${user.id}`);

    // Mock response object
    const res = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        console.log(`\n=== Response (Status: ${this.statusCode}) ===`);
        console.log(JSON.stringify(data, null, 2));
        return data;
      }
    };

    // Test tab=main
    console.log("\n--- Testing tab=main ---");
    const reqMain = {
      user: { id: user.id },
      query: { tab: 'main' }
    };
    await getFarmerProfile(reqMain, res);

    // Test tab=farm
    console.log("\n--- Testing tab=farm ---");
    const reqFarm = {
      user: { id: user.id },
      query: { tab: 'farm' }
    };
    await getFarmerProfile(reqFarm, res);

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    process.exit(0);
  }
}

test();
