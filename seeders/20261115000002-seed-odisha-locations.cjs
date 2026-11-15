'use strict';
/**
 * Seeder: Odisha Locations (State, Districts, Blocks, Gram Panchayats)
 *
 * Runs automatically during deployment with:
 *   npx sequelize-cli db:seed:all
 * or individually with:
 *   npx sequelize-cli db:seed --seed 20261115000002-seed-odisha-locations.cjs
 *
 * Idempotent:
 *   - Checks existing State, Districts, Blocks, and GPs by lgd_code.
 *   - Inserts only missing records and attaches correct foreign keys.
 *   - Updates lgd_code on existing rows if they were previously created without one.
 *   - Aligns PostgreSQL serial sequences so future inserts don't collide.
 */
const { QueryTypes } = require('sequelize');
const odishaData = require('./data/odisha-locations.json');

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    await sequelize.transaction(async (transaction) => {
      const now = new Date();
      console.log('Seeding Odisha location hierarchy...');

      // ── 1. State: Odisha (LGD: 21) ──────────────────────────────────
      const existingStates = await sequelize.query(
        `SELECT id, state_name, lgd_code FROM "MASTER_STATE" 
         WHERE lgd_code = 21 OR lower(state_name) = 'odisha' LIMIT 1`,
        { transaction, type: QueryTypes.SELECT }
      );

      let stateId;
      if (existingStates.length > 0) {
        stateId = existingStates[0].id;
        if (!existingStates[0].lgd_code) {
          await sequelize.query(
            `UPDATE "MASTER_STATE" SET lgd_code = 21, "updatedAt" = NOW() WHERE id = :id`,
            { replacements: { id: stateId }, transaction }
          );
        }
        console.log(`  State: reused existing "Odisha" (id=${stateId})`);
      } else {
        await queryInterface.bulkInsert('MASTER_STATE', [{
          state_name: 'Odisha',
          lgd_code: 21,
          is_active: true,
          created_on: now,
          createdAt: now,
          updatedAt: now,
        }], { transaction });

        const [stateRow] = await sequelize.query(
          `SELECT id FROM "MASTER_STATE" WHERE lgd_code = 21 LIMIT 1`,
          { transaction, type: QueryTypes.SELECT }
        );
        stateId = stateRow.id;
        console.log(`  State: created "Odisha" (id=${stateId})`);
      }

      // ── 2. Districts (30 in Odisha) ──────────────────────────────────
      const existingDistricts = await sequelize.query(
        `SELECT id, district_name, lgd_code FROM "MASTER_DISTRICT" WHERE state_id = :stateId`,
        { replacements: { stateId }, transaction, type: QueryTypes.SELECT }
      );

      const districtByLgd = new Map(existingDistricts.filter(d => d.lgd_code).map(d => [d.lgd_code, d.id]));
      const districtByName = new Map(existingDistricts.map(d => [d.district_name.toLowerCase().trim(), d]));

      const toInsertDistricts = [];
      for (const d of odishaData.districts) {
        if (districtByLgd.has(d.code)) continue;

        const match = districtByName.get(d.name.toLowerCase().trim());
        if (match) {
          districtByLgd.set(d.code, match.id);
          if (!match.lgd_code) {
            await sequelize.query(
              `UPDATE "MASTER_DISTRICT" SET lgd_code = :code, "updatedAt" = NOW() WHERE id = :id`,
              { replacements: { code: d.code, id: match.id }, transaction }
            );
          }
          continue;
        }

        toInsertDistricts.push({
          district_name: d.name,
          state_id: stateId,
          lgd_code: d.code,
          is_active: true,
          created_on: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (toInsertDistricts.length > 0) {
        await queryInterface.bulkInsert('MASTER_DISTRICT', toInsertDistricts, { transaction });
        console.log(`  Districts: inserted +${toInsertDistricts.length}`);
      }

      // Reload all district mappings for state
      const allDistricts = await sequelize.query(
        `SELECT id, lgd_code FROM "MASTER_DISTRICT" WHERE state_id = :stateId AND lgd_code IS NOT NULL`,
        { replacements: { stateId }, transaction, type: QueryTypes.SELECT }
      );
      const districtIdMap = new Map(allDistricts.map(d => [d.lgd_code, d.id]));
      console.log(`  Districts ready: ${districtIdMap.size} mapped`);

      // ── 3. Blocks (314 in Odisha) ────────────────────────────────────
      const existingBlocks = await sequelize.query(
        `SELECT id, block_name, district_id, lgd_code FROM "MASTER_BLOCK" 
         WHERE district_id IN (SELECT id FROM "MASTER_DISTRICT" WHERE state_id = :stateId)`,
        { replacements: { stateId }, transaction, type: QueryTypes.SELECT }
      );

      const blockByLgd = new Map(existingBlocks.filter(b => b.lgd_code).map(b => [b.lgd_code, b.id]));
      const blockByKey = new Map(existingBlocks.map(b => [`${b.district_id}:${b.block_name.toLowerCase().trim()}`, b]));

      const toInsertBlocks = [];
      for (const b of odishaData.blocks) {
        if (blockByLgd.has(b.code)) continue;

        const districtId = districtIdMap.get(b.district_code);
        if (!districtId) continue;

        const match = blockByKey.get(`${districtId}:${b.name.toLowerCase().trim()}`);
        if (match) {
          blockByLgd.set(b.code, match.id);
          if (!match.lgd_code) {
            await sequelize.query(
              `UPDATE "MASTER_BLOCK" SET lgd_code = :code, "updatedAt" = NOW() WHERE id = :id`,
              { replacements: { code: b.code, id: match.id }, transaction }
            );
          }
          continue;
        }

        toInsertBlocks.push({
          block_name: b.name,
          district_id: districtId,
          lgd_code: b.code,
          is_active: true,
          created_on: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (toInsertBlocks.length > 0) {
        await queryInterface.bulkInsert('MASTER_BLOCK', toInsertBlocks, { transaction });
        console.log(`  Blocks: inserted +${toInsertBlocks.length}`);
      }

      // Reload all block mappings
      const allBlocks = await sequelize.query(
        `SELECT id, lgd_code FROM "MASTER_BLOCK" 
         WHERE district_id IN (SELECT id FROM "MASTER_DISTRICT" WHERE state_id = :stateId) AND lgd_code IS NOT NULL`,
        { replacements: { stateId }, transaction, type: QueryTypes.SELECT }
      );
      const blockIdMap = new Map(allBlocks.map(b => [b.lgd_code, b.id]));
      console.log(`  Blocks ready: ${blockIdMap.size} mapped`);

      // ── 4. Gram Panchayats (6,373 in Odisha) ─────────────────────────
      const existingGps = await sequelize.query(
        `SELECT lgd_code FROM "MASTER_GRAMPANCHAYAT" 
         WHERE block_id IN (
           SELECT id FROM "MASTER_BLOCK" WHERE district_id IN (
             SELECT id FROM "MASTER_DISTRICT" WHERE state_id = :stateId
           )
         ) AND lgd_code IS NOT NULL`,
        { replacements: { stateId }, transaction, type: QueryTypes.SELECT }
      );

      const existingGpCodes = new Set(existingGps.map(g => Number(g.lgd_code)));
      const toInsertGps = [];

      for (const gp of odishaData.gram_panchayats) {
        const [gpName, gpCode, blockCode] = gp;
        if (existingGpCodes.has(gpCode)) continue;

        const blockId = blockIdMap.get(blockCode);
        if (!blockId) continue;

        toInsertGps.push({
          gram_panchayat_name: gpName,
          block_id: blockId,
          lgd_code: gpCode,
          is_active: true,
          created_on: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (toInsertGps.length > 0) {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < toInsertGps.length; i += BATCH_SIZE) {
          const chunk = toInsertGps.slice(i, i + BATCH_SIZE);
          await queryInterface.bulkInsert('MASTER_GRAMPANCHAYAT', chunk, { transaction });
        }
        console.log(`  Gram Panchayats: inserted +${toInsertGps.length}`);
      } else {
        console.log(`  Gram Panchayats: all ${existingGpCodes.size} already present`);
      }

      // ── 5. Align Serial Sequences (PostgreSQL) ──────────────────────
      try {
        for (const tbl of ['MASTER_STATE', 'MASTER_DISTRICT', 'MASTER_BLOCK', 'MASTER_GRAMPANCHAYAT']) {
          await sequelize.query(
            `SELECT setval(pg_get_serial_sequence('"${tbl}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${tbl}"), 1))`,
            { transaction }
          );
        }
      } catch (seqErr) {
        // Safe to ignore on non-Postgres dialects
      }

      console.log('✅ Odisha location hierarchy seeding complete.');
    });
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`
        DELETE FROM "MASTER_GRAMPANCHAYAT"
        WHERE block_id IN (
          SELECT b.id FROM "MASTER_BLOCK" b
          JOIN "MASTER_DISTRICT" d ON b.district_id = d.id
          JOIN "MASTER_STATE" s ON d.state_id = s.id
          WHERE s.lgd_code = 21 OR lower(s.state_name) = 'odisha'
        )
      `, { transaction });

      await sequelize.query(`
        DELETE FROM "MASTER_BLOCK"
        WHERE district_id IN (
          SELECT d.id FROM "MASTER_DISTRICT" d
          JOIN "MASTER_STATE" s ON d.state_id = s.id
          WHERE s.lgd_code = 21 OR lower(s.state_name) = 'odisha'
        )
      `, { transaction });

      await sequelize.query(`
        DELETE FROM "MASTER_DISTRICT"
        WHERE state_id IN (
          SELECT s.id FROM "MASTER_STATE" s
          WHERE s.lgd_code = 21 OR lower(s.state_name) = 'odisha'
        )
      `, { transaction });

      await sequelize.query(`
        DELETE FROM "MASTER_STATE"
        WHERE lgd_code = 21 OR lower(state_name) = 'odisha'
      `, { transaction });

      console.log('Odisha location hierarchy deleted.');
    });
  },
};
