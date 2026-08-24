/**
 * add_usage_columns.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot migration: adds post-job usage columns to SPRAYING_ORDER_EXTRAS.
 *
 * Run once with:  node add_usage_columns.js
 *
 * Idempotent — safe to re-run; skips columns that already exist.
 */

import db from './models/index.js';

const migrate = async () => {
  const { sequelize } = db;

  try {
    // Each block checks whether the column exists before adding it.
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'SPRAYING_ORDER_EXTRAS'
            AND column_name = 'usage_total_acres_covered'
        ) THEN
          ALTER TABLE "SPRAYING_ORDER_EXTRAS"
            ADD COLUMN "usage_total_acres_covered" DECIMAL(8,2) DEFAULT NULL;
          RAISE NOTICE 'Added usage_total_acres_covered';
        ELSE
          RAISE NOTICE 'usage_total_acres_covered already exists — skipped';
        END IF;
      END $$;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'SPRAYING_ORDER_EXTRAS'
            AND column_name = 'usage_fertilizer_kg'
        ) THEN
          ALTER TABLE "SPRAYING_ORDER_EXTRAS"
            ADD COLUMN "usage_fertilizer_kg" DECIMAL(8,2) DEFAULT NULL;
          RAISE NOTICE 'Added usage_fertilizer_kg';
        ELSE
          RAISE NOTICE 'usage_fertilizer_kg already exists — skipped';
        END IF;
      END $$;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'SPRAYING_ORDER_EXTRAS'
            AND column_name = 'usage_pesticide_ltr'
        ) THEN
          ALTER TABLE "SPRAYING_ORDER_EXTRAS"
            ADD COLUMN "usage_pesticide_ltr" DECIMAL(8,2) DEFAULT NULL;
          RAISE NOTICE 'Added usage_pesticide_ltr';
        ELSE
          RAISE NOTICE 'usage_pesticide_ltr already exists — skipped';
        END IF;
      END $$;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'SPRAYING_ORDER_EXTRAS'
            AND column_name = 'usage_water_ltr'
        ) THEN
          ALTER TABLE "SPRAYING_ORDER_EXTRAS"
            ADD COLUMN "usage_water_ltr" DECIMAL(8,2) DEFAULT NULL;
          RAISE NOTICE 'Added usage_water_ltr';
        ELSE
          RAISE NOTICE 'usage_water_ltr already exists — skipped';
        END IF;
      END $$;
    `);

    console.log('✅  Migration complete — SPRAYING_ORDER_EXTRAS usage columns are ready.');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
};

migrate();
