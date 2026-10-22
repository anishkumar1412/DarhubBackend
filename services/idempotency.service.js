/**
 * Storage for Idempotency-Key records (see middleware/idempotency.js).
 *
 * claim() decides what to do with an incoming request, atomically, even when several server instances receive the
 * same retry at the same moment:
 *   new          first time this key is seen (or a crashed attempt is being taken over): run the handler
 *   replay       the request already finished: send back the stored status and body
 *   in_progress  another copy of the request is running right now
 *   mismatch     the key was already used for a DIFFERENT request (other body or path)
 *
 * Times come from the database clock (now()), so instances with skewed clocks agree.
 */
const TABLE = '"IDEMPOTENCY_KEY"';

export class SqlIdempotencyStore {
  constructor(database) {
    this.db = database;
  }

  async claim({ userId, scope, key, requestHash, lockSeconds, ttlSeconds }) {
    const { sequelize, QueryTypes } = this.db;
    // Two passes at most: the second runs only after an expired record was removed
    for (let attempt = 0; attempt < 2; attempt++) {
      const inserted = await sequelize.query(
        `INSERT INTO ${TABLE} (user_id, scope, idem_key, request_hash, status, locked_until, expires_at, created_on)
         VALUES (:userId, :scope, :key, :requestHash, 'processing',
                 now() + make_interval(secs => :lockSeconds), now() + make_interval(secs => :ttlSeconds), now())
         ON CONFLICT (user_id, scope, idem_key) DO NOTHING
         RETURNING id`,
        { replacements: { userId, scope, key, requestHash, lockSeconds, ttlSeconds }, type: QueryTypes.SELECT },
      );
      if (inserted.length) return { outcome: 'new', id: inserted[0].id };

      const [row] = await sequelize.query(
        `SELECT id, request_hash, status, response_status, response_body,
                expires_at < now() AS expired,
                locked_until < now() AS lock_expired,
                GREATEST(1, CEIL(EXTRACT(EPOCH FROM (locked_until - now()))))::int AS lock_seconds_left
           FROM ${TABLE} WHERE user_id = :userId AND scope = :scope AND idem_key = :key`,
        { replacements: { userId, scope, key }, type: QueryTypes.SELECT },
      );
      if (!row) continue;                         // removed between the two statements: try the insert again

      if (row.expired) {
        await sequelize.query(`DELETE FROM ${TABLE} WHERE id = :id AND expires_at < now()`, { replacements: { id: row.id } });
        continue;
      }
      if (row.request_hash !== requestHash) return { outcome: 'mismatch' };
      if (row.status === 'completed') {
        return { outcome: 'replay', status: row.response_status, body: row.response_body };
      }
      if (row.lock_expired) {
        // The attempt that held this key died before finishing (crash, deploy). Exactly one retry takes it over.
        const taken = await sequelize.query(
          `UPDATE ${TABLE} SET locked_until = now() + make_interval(secs => :lockSeconds), modified_on = now()
            WHERE id = :id AND status = 'processing' AND locked_until < now()
            RETURNING id`,
          { replacements: { id: row.id, lockSeconds }, type: QueryTypes.SELECT },
        );
        if (taken.length) return { outcome: 'new', id: row.id };
      }
      return { outcome: 'in_progress', retryAfter: row.lock_seconds_left || 1 };
    }
    return { outcome: 'in_progress', retryAfter: 1 };
  }

  /** Stores the final response. Pass `transaction` to save it together with the data the request created. */
  async complete(id, status, body, { transaction } = {}) {
    const [, meta] = await this.db.sequelize.query(
      `UPDATE ${TABLE}
          SET status = 'completed', response_status = :status, response_body = CAST(:body AS jsonb),
              locked_until = NULL, modified_on = now()
        WHERE id = :id AND status = 'processing'`,
      { replacements: { id, status, body: JSON.stringify(body ?? null) }, transaction },
    );
    return (meta?.rowCount ?? 0) > 0;
  }

  /** Forgets an attempt that failed in a retryable way, so the client can retry with the same key. */
  async release(id) {
    await this.db.sequelize.query(`DELETE FROM ${TABLE} WHERE id = :id AND status = 'processing'`, { replacements: { id } });
  }

  async purgeExpired() {
    const [, meta] = await this.db.sequelize.query(`DELETE FROM ${TABLE} WHERE expires_at < now()`);
    return meta?.rowCount ?? 0;
  }
}

// The models are imported on first use, so unit tests that pass their own store never open a database connection.
let sharedStore;
export const getDefaultIdempotencyStore = async () => {
  if (!sharedStore) sharedStore = new SqlIdempotencyStore((await import('../models/index.js')).default);
  return sharedStore;
};

/** Same rules in memory, for unit tests. */
export class MemoryIdempotencyStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.rows = new Map();
    this.nextId = 1;
  }

  async claim({ userId, scope, key, requestHash, lockSeconds, ttlSeconds }) {
    const k = `${userId}|${scope}|${key}`;
    const now = this.now();
    let row = this.rows.get(k);
    if (row && row.expiresAt < now) {
      this.rows.delete(k);
      row = undefined;
    }
    if (!row) {
      row = { id: this.nextId++, requestHash, status: 'processing', lockedUntil: now + lockSeconds * 1000, expiresAt: now + ttlSeconds * 1000 };
      this.rows.set(k, row);
      return { outcome: 'new', id: row.id };
    }
    if (row.requestHash !== requestHash) return { outcome: 'mismatch' };
    if (row.status === 'completed') return { outcome: 'replay', status: row.responseStatus, body: row.responseBody };
    if (row.lockedUntil < now) {
      row.lockedUntil = now + lockSeconds * 1000;
      return { outcome: 'new', id: row.id };
    }
    return { outcome: 'in_progress', retryAfter: Math.max(1, Math.ceil((row.lockedUntil - now) / 1000)) };
  }

  #byId(id) {
    for (const row of this.rows.values()) if (row.id === id) return row;
    return undefined;
  }

  async complete(id, status, body) {
    const row = this.#byId(id);
    if (!row || row.status !== 'processing') return false;
    Object.assign(row, { status: 'completed', responseStatus: status, responseBody: JSON.parse(JSON.stringify(body ?? null)), lockedUntil: null });
    return true;
  }

  async release(id) {
    for (const [k, row] of this.rows) if (row.id === id && row.status === 'processing') this.rows.delete(k);
  }

  async purgeExpired() {
    let n = 0;
    for (const [k, row] of this.rows) if (row.expiresAt < this.now()) { this.rows.delete(k); n++; }
    return n;
  }
}
