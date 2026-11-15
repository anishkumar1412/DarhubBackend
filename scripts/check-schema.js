/**
 * Schema drift check: do the Sequelize models match the database the migrations produced?
 *
 *   npm run db:check                            against .env.local (the Docker database)
 *   ENV_FILE=.env.staging npm run db:check      against another database (read-only: it only reads the catalog)
 *
 * Reports, per model: missing tables, missing columns, type mismatches, nullability mismatches; and any migration
 * that has not been applied. Exit code 1 when the database cannot serve the models (use it as a CI / release gate:
 * a model change without a migration fails here). Columns the database has but the models do not are listed as
 * notes: harmless, but a sign of a hand-made change that should become a migration.
 */
// Same rule as the sequelize-cli config: never fall back to the project's plain `.env` (the shared remote dev database)
if (!process.env.ENV_FILE && !process.env.DB_HOST) process.env.ENV_FILE = '.env.local';

const { default: db, syncPromise } = await import('../models/index.js');
const { pendingMigrations } = await import('../utils/migrationStatus.js');

// Sequelize type key -> information_schema.columns.data_type
const PG_TYPE = {
  STRING: 'character varying', TEXT: 'text', INTEGER: 'integer', BIGINT: 'bigint', FLOAT: 'double precision',
  BOOLEAN: 'boolean', DATE: 'timestamp with time zone', DATEONLY: 'date', DECIMAL: 'numeric', UUID: 'uuid',
  JSONB: 'jsonb', ENUM: 'USER-DEFINED',
};

const errors = [];
const notes = [];

try {
  await syncPromise;
  const { sequelize } = db;
  const { host, port, database } = sequelize.config;
  console.log(`Checking ${Object.keys(sequelize.models).length} models against ${host}:${port}/${database}\n`);

  const rows = await sequelize.query(
    `SELECT table_name, column_name, data_type, is_nullable, character_maximum_length, numeric_precision, numeric_scale
       FROM information_schema.columns WHERE table_schema = 'public'`,
    { type: 'SELECT' },
  );
  const tables = new Map();
  for (const row of rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Map());
    tables.get(row.table_name).set(row.column_name, row);
  }

  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    const columns = tables.get(table);
    if (!columns) {
      errors.push(`${model.name}: table "${table}" does not exist`);
      continue;
    }
    const known = new Set();
    for (const attribute of Object.values(model.rawAttributes)) {
      const name = attribute.field || attribute.fieldName;
      known.add(name);
      const column = columns.get(name);
      if (!column) {
        errors.push(`${table}.${name}: column missing (model ${model.name})`);
        continue;
      }
      const expected = PG_TYPE[attribute.type.key];
      if (expected && column.data_type !== expected) {
        errors.push(`${table}.${name}: type is ${column.data_type}, model expects ${expected}`);
      }
      if (attribute.type.key === 'STRING' && column.character_maximum_length && column.character_maximum_length !== attribute.type._length) {
        errors.push(`${table}.${name}: varchar(${column.character_maximum_length}), model expects varchar(${attribute.type._length})`);
      }
      if (attribute.type.key === 'DECIMAL' && attribute.type._precision
        && (column.numeric_precision !== attribute.type._precision || column.numeric_scale !== attribute.type._scale)) {
        errors.push(`${table}.${name}: numeric(${column.numeric_precision},${column.numeric_scale}), model expects numeric(${attribute.type._precision},${attribute.type._scale})`);
      }
      const modelNullable = !attribute.primaryKey && attribute.allowNull !== false;
      const dbNullable = column.is_nullable === 'YES';
      if (dbNullable && !modelNullable) errors.push(`${table}.${name}: nullable in the database, NOT NULL in the model`);
      if (!dbNullable && modelNullable) errors.push(`${table}.${name}: NOT NULL in the database, nullable in the model (inserts without it will fail)`);
    }
    for (const name of columns.keys()) {
      if (!known.has(name)) notes.push(`${table}.${name}: in the database, not in the model`);
    }
  }

  const pending = await pendingMigrations(sequelize);
  for (const file of pending) errors.push(`migration not applied: ${file}`);
} finally {
  await db.sequelize.close();
}

for (const note of notes) console.log(`note   ${note}`);
for (const error of errors) console.log(`ERROR  ${error}`);
console.log(errors.length
  ? `\n${errors.length} problem(s): the database does not match the models. Add/apply a migration.`
  : `\nOK: every model matches the database and all migrations are applied.${notes.length ? ` (${notes.length} note(s) above)` : ''}`);
process.exit(errors.length ? 1 : 0);
