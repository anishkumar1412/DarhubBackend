'use strict';
/**
 * Shared helpers for the baseline "create table" migrations.
 *
 * ensureTables  creates each table when it is missing. When the table already exists (a database that was built
 *               earlier by sequelize.sync()) it is never altered or dropped: only columns and indexes that are
 *               missing are added, so running the baseline against such a database is safe and lets it converge.
 * dropTables    the matching `down`. Refused in production unless ALLOW_DESTRUCTIVE_MIGRATION=true.
 * ensureForeignKeys / dropForeignKeys   foreign keys, by constraint name (default PostgreSQL name <table>_<column>_fkey).
 *
 * A table is described as  [name, { column: definition, ... }, [ [[fields], { name, unique, where }], ... ]?]
 */

const hasIndex = async (queryInterface, table, name) => {
  const indexes = await queryInterface.showIndex(table);
  return indexes.some((i) => i.name === name);
};

async function ensureTables(queryInterface, tables) {
  for (const [table, columns, indexes = []] of tables) {
    if (!(await queryInterface.tableExists(table))) {
      await queryInterface.createTable(table, columns);
    } else {
      const existing = await queryInterface.describeTable(table);
      for (const [column, definition] of Object.entries(columns)) {
        if (existing[column]) continue;
        // A NOT NULL column cannot be added to a table that already has rows unless it has a default
        const addable = definition.allowNull === false && definition.defaultValue === undefined && !definition.primaryKey
          ? { ...definition, allowNull: true }
          : definition;
        await queryInterface.addColumn(table, column, addable);
        console.log(`  ${table}: added missing column "${column}"`);
      }
    }
    for (const [fields, options] of indexes) {
      if (!(await hasIndex(queryInterface, table, options.name))) {
        await queryInterface.addIndex(table, fields, options);
      }
    }
  }
}

async function dropTables(queryInterface, tables) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_MIGRATION !== 'true') {
    throw new Error('Refusing to drop tables in production. Set ALLOW_DESTRUCTIVE_MIGRATION=true to override.');
  }
  for (const [table, columns] of [...tables].reverse()) {
    await queryInterface.dropTable(table, { cascade: true });
    // dropTable leaves the ENUM types that the table's columns created behind
    for (const [column, definition] of Object.entries(columns)) {
      if (definition.type && definition.type.key === 'ENUM') {
        await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_${table}_${column}" CASCADE`);
      }
    }
  }
}

const q = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

/** [table, column, referenced table, referenced column, ON DELETE, ON UPDATE] */
async function ensureForeignKeys(queryInterface, foreignKeys) {
  const { sequelize } = queryInterface;
  for (const [table, column, refTable, refColumn, onDelete, onUpdate] of foreignKeys) {
    const name = `${table}_${column}_fkey`;
    const [found] = await sequelize.query(
      'SELECT 1 FROM pg_constraint WHERE conname = :name AND conrelid = to_regclass(:rel)',
      { replacements: { name, rel: q(table) } },
    );
    if (found.length) continue;
    // NOT VALID first: enforced for every new/changed row at once, and rows that already exist (a database built
    // earlier) cannot block the migration. VALIDATE then checks them; a failure is reported, not fatal.
    await sequelize.query(
      `ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(name)} FOREIGN KEY (${q(column)}) REFERENCES ${q(refTable)} (${q(refColumn)}) ` +
      `ON DELETE ${onDelete} ON UPDATE ${onUpdate} NOT VALID`,
    );
    try {
      await sequelize.query(`ALTER TABLE ${q(table)} VALIDATE CONSTRAINT ${q(name)}`);
    } catch (err) {
      console.warn(`  WARNING ${name} left NOT VALID: existing rows violate it (${err.message}). Clean the data, then VALIDATE it.`);
    }
  }
}

async function dropForeignKeys(queryInterface, foreignKeys) {
  for (const [table, column] of [...foreignKeys].reverse()) {
    await queryInterface.sequelize.query(`ALTER TABLE IF EXISTS ${q(table)} DROP CONSTRAINT IF EXISTS ${q(`${table}_${column}_fkey`)}`);
  }
}

const fs = require('fs');
const path = require('path');

const SQL_DIR = path.resolve(__dirname, '../../db/sql');
const readSql = (file) => fs.readFileSync(path.join(SQL_DIR, file), 'utf8');

/**
 * Splits a simple SQL file (no DO $$ blocks) into statements. Needed for CREATE INDEX CONCURRENTLY, which PostgreSQL
 * refuses inside a transaction or a multi-statement query: each statement must be sent on its own.
 */
const splitStatements = (sql) => sql
  .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
  .split(';').map((statement) => statement.trim()).filter(Boolean);

/** Constraints still NOT VALID (existing rows not yet checked): try to validate, report the ones that fail. */
async function validateConstraints(queryInterface) {
  const [pending] = await queryInterface.sequelize.query(
    `SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint WHERE NOT convalidated AND connamespace = 'public'::regnamespace`,
  );
  for (const { tbl, conname } of pending) {
    try {
      await queryInterface.sequelize.query(`ALTER TABLE ${tbl} VALIDATE CONSTRAINT ${q(conname)}`);
    } catch (err) {
      console.warn(`  WARNING ${conname} on ${tbl} left NOT VALID: existing rows violate it (${err.message}).`);
    }
  }
}

module.exports = {
  ensureTables, dropTables, ensureForeignKeys, dropForeignKeys,
  readSql, splitStatements, validateConstraints,
};
