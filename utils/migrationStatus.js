import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

/** File names of every migration shipped with this release, oldest first. */
export const migrationFiles = () => fs.readdirSync(MIGRATIONS_DIR)
  .filter((file) => /^\d+-.+\.(cjs|js)$/.test(file))
  .sort();

/**
 * Migrations shipped with this release that the connected database has not run yet (all of them when the database
 * has never been migrated: no "SequelizeMeta" table). Read-only.
 */
export const pendingMigrations = async (sequelize) => {
  const [table] = await sequelize.query(`SELECT to_regclass('public."SequelizeMeta"') AS name`, { type: 'SELECT' });
  const applied = table.name
    ? new Set((await sequelize.query('SELECT name FROM "SequelizeMeta"', { type: 'SELECT' })).map((row) => row.name))
    : new Set();
  return migrationFiles().filter((file) => !applied.has(file));
};
