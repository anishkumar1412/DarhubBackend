/**
 * Transaction-scoped advisory locks (PostgreSQL). Two requests that ask for the same key run one after the other
 * instead of both reading the same "free" state and both writing: this is what makes "check availability, then
 * book" safe when the database itself has no unique constraint to fall back on. The lock is released automatically
 * when the transaction ends. Keys are sorted so concurrent callers can never deadlock each other.
 */
export const lockKeys = async (sequelize, transaction, keys) => {
  if (sequelize.getDialect() !== 'postgres') return;
  for (const key of [...new Set(keys.filter(Boolean).map(String))].sort()) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key }, transaction });
  }
};
