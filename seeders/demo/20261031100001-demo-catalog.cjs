'use strict';
/**
 * DEMO / DEVELOPMENT ONLY — never run in production (`npm run db:seed:demo`).
 *
 * A small sample catalogue so the apps and the admin panel have something to show: crops with a price per acre,
 * the acreage -> working-days bands, and a few fertilizers. THE PRICES ARE PLACEHOLDERS. In production an
 * administrator enters the real crops, prices and bands in the admin panel (crops:manage, working_days:manage).
 *
 * Each row is created only when its name (or acreage band) is not there yet, so re-running changes nothing.
 * The bands match the booking code's own default of 5 acres per drone-day (utils/workingDays.js).
 */
const { QueryTypes } = require('sequelize');

const CROPS = [
  ['Paddy', 'Rice', 500], ['Wheat', 'Winter cereal', 450], ['Cotton', 'Fibre crop', 600],
  ['Sugarcane', 'Cash crop', 650], ['Maize', 'Cereal', 480], ['Groundnut', 'Oilseed', 520],
];

// [min acre, max acre, days]
const WORKING_DAYS = [[0.1, 5, 1], [5.01, 10, 2], [10.01, 20, 4], [20.01, 50, 10]];

// [name, type, company, packageType, quantity, unit, price]
const FERTILIZERS = [
  ['Nano Urea', 'Liquid', 'Sample Agro Co.', 'Bottle', 500, 'ml', 240],
  ['Nano DAP', 'Liquid', 'Sample Agro Co.', 'Bottle', 500, 'ml', 600],
  ['Micronutrient Mix', 'Powder', 'Sample Agro Co.', 'Pouch', 1, 'kg', 320],
];

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    const now = new Date();
    const audit = { is_active: true, created_on: now, createdAt: now, updatedAt: now };

    await sequelize.transaction(async (transaction) => {
      const existing = async (sql) => sequelize.query(sql, { type: QueryTypes.SELECT, transaction });

      const crops = new Set((await existing('SELECT lower(name) AS k FROM "MASTER_CROP" WHERE name IS NOT NULL')).map((r) => r.k));
      const newCrops = CROPS.filter(([name]) => !crops.has(name.toLowerCase()));
      if (newCrops.length) {
        await queryInterface.bulkInsert('MASTER_CROP', newCrops.map(([name, desc, price]) => ({ name, desc, price_per_acre: price, ...audit })), { transaction });
      }

      const bands = new Set((await existing('SELECT min_acre::float || \'-\' || max_acre::float AS k FROM "MASTER_WORKING_DAYS"')).map((r) => r.k));
      const newBands = WORKING_DAYS.filter(([min, max]) => !bands.has(`${min}-${max}`));
      if (newBands.length) {
        await queryInterface.bulkInsert('MASTER_WORKING_DAYS', newBands.map(([min, max, days]) => ({ min_acre: min, max_acre: max, working_days: days, ...audit })), { transaction });
      }

      const fertilizers = new Set((await existing('SELECT lower(name) AS k FROM fertilizers')).map((r) => r.k));
      const newFertilizers = FERTILIZERS.filter(([name]) => !fertilizers.has(name.toLowerCase()));
      if (newFertilizers.length) {
        await queryInterface.bulkInsert('fertilizers', newFertilizers.map(([name, type, company, packageType, quantity, unit, price]) => (
          { name, type, company, packageType, quantity, unit, price, is_active: true, created_on: now }
        )), { transaction });
      }

      console.log(`  crops +${newCrops.length}, working-day bands +${newBands.length}, fertilizers +${newFertilizers.length}`);
    });
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    const quote = (values) => values.map((v) => sequelize.escape(v.toLowerCase())).join(', ');
    await sequelize.query(`DELETE FROM "MASTER_CROP" WHERE lower(name) IN (${quote(CROPS.map(([n]) => n))})`);
    await sequelize.query(`DELETE FROM fertilizers WHERE lower(name) IN (${quote(FERTILIZERS.map(([n]) => n))})`);
    for (const [min, max] of WORKING_DAYS) {
      await sequelize.query('DELETE FROM "MASTER_WORKING_DAYS" WHERE min_acre = :min AND max_acre = :max', { replacements: { min, max } });
    }
  },
};
