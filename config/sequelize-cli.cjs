/**
 * Connection settings for sequelize-cli (migrations and seeders).
 *
 * Which database it targets, in order:
 *   1. ENV_FILE=<path>           load that file (same switch the server and the scripts use)
 *   2. variables already set     the platform's environment (Render, Docker, CI): DB_HOST etc.
 *   3. otherwise                 .env.local, the Docker database from docker-compose.local-db.yml
 * The project's plain `.env` is never loaded implicitly (it points at the shared remote dev database).
 *
 * Safety net: a database that is not on this machine is refused unless NODE_ENV=production (a real deployment) or
 * ALLOW_REMOTE_DB=true is set, so a stray command cannot migrate or seed the shared database by accident.
 */
const path = require('path');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const envFile = process.env.ENV_FILE
  ? path.resolve(process.env.ENV_FILE)
  : (process.env.DB_HOST ? null : path.join(root, '.env.local'));

if (envFile) dotenv.config({ path: envFile, quiet: true });

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_DIALECT = 'postgres', DB_SSL, NODE_ENV } = process.env;

if (!DB_HOST || !DB_USER || !DB_NAME) {
  throw new Error(
    `Database settings are missing (DB_HOST / DB_USER / DB_NAME). Looked in ${envFile || 'the process environment'}. ` +
    'Copy .env.local.example to .env.local, or set ENV_FILE.'
  );
}

const isLocal = ['localhost', '127.0.0.1', '::1'].includes(DB_HOST);
if (!isLocal && NODE_ENV !== 'production' && process.env.ALLOW_REMOTE_DB !== 'true') {
  throw new Error(
    `Refusing to run migrations/seeders against the remote database ${DB_HOST}/${DB_NAME} (NODE_ENV=${NODE_ENV || 'unset'}). ` +
    'Set ALLOW_REMOTE_DB=true if you really mean it.'
  );
}

const settings = {
  username: DB_USER,
  password: DB_PASSWORD || null,
  database: DB_NAME,
  host: DB_HOST,
  port: Number(DB_PORT) || 5432,
  dialect: DB_DIALECT,
  logging: false,
  // TLS is on by default (same rule as config/env.js); DB_SSL=false for a local database without TLS
  dialectOptions: String(DB_SSL) === 'false' ? {} : { ssl: { require: true, rejectUnauthorized: false } },
  // Seeders re-run safely (they upsert), so they are not recorded; migrations are recorded in "SequelizeMeta".
  seederStorage: 'none',
};

// sequelize-cli picks the block named after NODE_ENV (default "development"): the same settings serve all of them.
module.exports = { development: settings, test: settings, production: settings };
