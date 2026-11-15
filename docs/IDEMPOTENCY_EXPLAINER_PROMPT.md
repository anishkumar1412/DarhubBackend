# Prompt: explain the Darhub Idempotency-Key implementation in depth

> How to use: paste this whole file into a reasoning model (o-series, Claude, Gemini, DeepSeek-R1 ...) as one message.
> Everything the model needs is inside. The source listings in Part B are copied from the real files, with their real
> line numbers.

---

## Part A: Instructions

### Your role and goal

You are a senior backend engineer. You review and teach distributed-systems correctness: idempotency, concurrency, database transactions and failure handling.

A teammate implemented `Idempotency-Key` support in **Darhub**, a production agri-drone spraying marketplace. Your job is to **explain that implementation in depth**: what it does, how every piece works, why it was built this way, what guarantees it gives under concurrency and failure, and where those guarantees stop.

The source code in **Part B is the ground truth**. Part A summarises the system and the author's intent. Where a summary and the code disagree, trust the code and point out the disagreement.

### Who will read your explanation

1. **Primary:** a backend developer joining the team. They know Node.js/Express, SQL and HTTP, but have never seen this codebase or a formal idempotency design. After reading, they should be able to maintain the code, add it to a new endpoint, and debug a duplicate-booking report.
2. **Secondary:** a product or engineering lead who needs the opening summary and the limitations, not the internals.

Write in clear, plain English. Define each term the first time you use it, for example "idempotent", "fencing token", "MVCC", "READ COMMITTED", "compare-and-set".

### The system (context)

- **Product.** Farmers book drone spraying for their fields from an Android app (Kotlin). Admins schedule a pilot and a drone from a React web panel. Pilots run the job from a second Android app.
- **Backend.** Node.js 25, Express 5 (ESM), Sequelize 6 over PostgreSQL (14 in tests; managed Postgres in production), JWT auth. It is hosted on Render's free tier: a cold start takes 30-60 s, so clients time out and retry often. It may run as several instances.
- **Redis is optional** in this project. It only holds OTP rate limits and falls back to process memory.
- **The original bug.** `POST /order/create-order` had no duplicate protection. A test sent 5 identical requests at once and got 5 orders. Real causes: double taps, a retry after a timeout whose first attempt had already succeeded, OkHttp's automatic retry of a request on a dropped connection, and an admin pressing "Confirm" again after one part of a multi-request save failed.
- **The fix.** An `Idempotency-Key` HTTP header, following the IETF draft "The Idempotency-Key HTTP Header Field" and Stripe's design. Keys live in a Postgres table. For create-order, the stored response is written **in the same database transaction** as the order. The middleware is also mounted on admin assign-work and on farmer cancel/reschedule. The Farmer app and the admin panel send keys.

### The author's stated contract (verify it against the code)

| Situation | Response |
|---|---|
| First request with a key | runs; final response stored for 24 h |
| Same key + same body | stored response replayed with `Idempotent-Replayed: true`; handler not run |
| Same key while the first is running | `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` + `Retry-After` |
| Same key + different body/URL | `422 IDEMPOTENCY_KEY_REUSED` |
| Malformed key | `400 INVALID_IDEMPOTENCY_KEY` |
| No key | runs unprotected, or `400 IDEMPOTENCY_KEY_REQUIRED` when `IDEMPOTENCY_KEY_REQUIRED=true` (create-order only) |
| Key store unavailable | `503` (fail closed) |
| 2xx and non-retryable 4xx | stored and replayed |
| 5xx, 408/409/425/429, crash, closed connection | key released so the same key can be retried |
| Attempt stuck in `processing` past a 60 s lock | exactly one retry may take it over |

The author has already acknowledged one limitation: a handler that is **slow but alive** for more than 60 s can be taken over by a retry and run twice. The suggested fix is a fencing token.

### What to produce

Use this structure and these headings. Be thorough: this is a teaching document, so depth is the point. Avoid filler and repetition.

1. **Summary (≤ 150 words, for the lead).** What problem this solves, the one-sentence mechanism, the main guarantee, the main limitation.

2. **The problem and why simple fixes fail.** Explain why each of these is not enough on its own:
   - disabling the button on the client;
   - a unique constraint on order fields (farmer + date + acres);
   - a Redis `SETNX` lock;
   - storing the response after the handler returns, outside the transaction.

   Tie each one to a concrete failure in this system.

3. **The HTTP contract.** Restate it from the code. Confirm or correct each row of the table above, citing the lines that implement it.

4. **Architecture.** List the components and their responsibilities: middleware, store interface, SQL store, memory store, model and migration, controller integration, cron cleanup, CORS, config. Include a component diagram (Mermaid `flowchart`).

5. **Request lifecycle walkthrough.** Follow one request through `idempotent()` line by line:
   - key validation, scope, request hash and `stableStringify`;
   - each outcome of `claim()`;
   - the `req.idempotency.complete` hook;
   - the `res.json` wrapper and the store-or-release decision;
   - the `close` handler.

   Explain *why* each step exists. Point out subtleties, for example:
   - why the response is sent only after storing finishes;
   - why the `res.json` wrapper is installed after the claim;
   - which middleware wraps `res.json` first (`hideServerErrorDetails` is mounted app-wide earlier) and whether the order matters.

6. **The data model and every SQL statement.** For `claim`, the takeover `UPDATE`, `complete`, `release` and `purgeExpired`, explain:
   - what the statement does and which Postgres guarantee it relies on: the unique index, `INSERT ... ON CONFLICT DO NOTHING` semantics under concurrency (including when one inserter's transaction is not yet committed), READ COMMITTED snapshots per statement, row locks taken by `UPDATE`, conditional `WHERE` clauses as compare-and-set, `RETURNING`, `now()` as a single clock;
   - why the `status = 'processing'` guard exists on `complete` and `release`;
   - why expired rows are deleted and re-inserted at most once.

   Where Sequelize behaviour matters (for example what `sequelize.query` returns as `meta.rowCount` for an `UPDATE` with the `pg` dialect, or whether queries without a transaction run in autocommit), state what you believe and how sure you are.

7. **Atomicity of create-order.** Explain why `complete(201, body, { transaction: t })` is called inside the order transaction, and why it is registered through `transaction.afterCommit`. Build a crash-point table: crash before the INSERTs, between the INSERTs, after `complete` but before commit, after commit but before the reply, after the reply. For each row give the database state and what a retry with the same key gets.

8. **Concurrency and failure scenarios: step-by-step timelines.** For each scenario write a numbered timeline (T0, T1, ...). Name the actor (client A, client B, instance 1, instance 2), the exact SQL or code that runs, the row's state after each step, and the HTTP responses. Then give a verdict: guaranteed / probabilistic / broken. Draw a Mermaid `sequenceDiagram` for at least a, c, d and h.
   - a. 10 identical requests with one key arrive at the same moment, spread over 2 instances.
   - b. The first request succeeds, the response is lost on the network, and the client retries 5 s later.
   - c. Instance crashes (i) before the order transaction commits and (ii) after commit but before replying. Then a retry arrives at 30 s and again at 61 s.
   - d. Two retries arrive at the same moment after the 60 s lock has expired (takeover race).
   - e. Same key, different body (farmer changed acres).
   - f. The handler throws a `400` *inside* the transaction after `complete` was called (rollback). Show why `afterCommit` matters and what ends up stored.
   - g. The handler returns `503`, then the client retries with the same key.
   - h. A slow but alive handler (database stall, 70 s): show exactly how a second order can be created. Quantify how likely this is.
   - i. The database is unreachable during `claim`.
   - j. While request 1 is inside its order transaction and has already run `complete` (uncommitted), request 2 with the same key calls `claim`. What does its `SELECT` see? Does its takeover `UPDATE` block on the row lock, and what happens after request 1 commits or rolls back?
   - k. A key is reused after 24 h, both before and after the nightly purge.

9. **Client behaviour.**
   - Farmer app (Kotlin): when a key is reused and when it is regenerated, and why `data class` equality is the right identity; the in-flight guard; the wait-and-resend loop on 409 and why the error body is read only once; why cancel uses a deterministic key (UUID v3 of action + booking + reason), with its trade-off.
   - Admin panel (React): one key per request body; why assign-work uses **one key per drone group** and how that makes a partial failure safe to resubmit; the `crypto.randomUUID` fallback.

   Point out client-side gaps, for example the key living in a `ViewModel` (lost on process death).

10. **Tests.** For each test, say what property it proves and what it cannot prove. The memory store is not the SQL store, and single-process tests are not multi-instance tests. List the 3-5 most valuable tests that are still missing, each with a one-paragraph sketch.

11. **Design decisions and alternatives.** Cover:
    - Postgres vs Redis for the key store;
    - storing 4xx vs not;
    - which statuses count as retryable;
    - per-user and per-endpoint scope;
    - hashing the raw body vs the validated body (create-order hashes before validation; the farmer routes hash after `validate()`);
    - optional vs required key and the rollout plan;
    - 60 s lock and 24 h TTL;
    - fail-closed on store errors.

    For each: what was chosen, what the alternative was, and the trade-off.

12. **Limitations and improvements, ranked by risk.** Start with the slow-handler takeover. Sketch a concrete fencing-token fix in code: a `claim_version` or attempt-id column incremented on takeover, a version check in `complete()`, and the transaction rolled back when 0 rows are updated. Also consider: Android process death; old clients without keys; memory use of large stored bodies; replaying a stored `dev_otp` field; observability (metrics or logs for replays, 409s and takeovers).

13. **Findings (your own review).** Report any bug, race or inconsistency you found that the author did not list. Each finding needs a severity, a concrete trace (inputs → steps → wrong outcome), the file and line, and a suggested fix. If you found nothing beyond what is listed, say so explicitly, and say what you checked.

14. **Glossary.**

### Rules

- Cite code as `path:line` using the line numbers in Part B, for every non-obvious claim.
- Do not invent behaviour that is not in the code, for example Redis use, a payment gateway, or retries the code does not do.
- Separate **facts from the code** from **your inferences** about Postgres, Sequelize, Express or OkHttp internals. Mark inferences ("I believe ...") and give your confidence.
- Prefer exact traces over vague statements. "Request B's INSERT returns no row because ..." beats "the database handles it".
- If something cannot be decided from the listings (for example code not shown here), say what you would need to see.
- Use Markdown with headings, tables, numbered timelines and Mermaid diagrams. Wrap code in fenced blocks.

---

## Part B: Source listings (ground truth)

Line numbers are the real line numbers in the repository. Excerpts say which lines they cover. `…` marks omitted lines.

## B1. Backend: core

### `DarhubBackend/middleware/idempotency.js` (whole file)

```js
  1  import { createHash } from 'crypto';
  2  import logger from '../utils/logger.js';
  3  import { respondWithError } from './errorHandler.js';
  4  import { getDefaultIdempotencyStore } from '../services/idempotency.service.js';
  5  
  6  /**
  7   * Idempotency-Key support for requests that create or change something (IETF draft "The Idempotency-Key HTTP
  8   * Header Field", same rules as Stripe). A client that may send a request twice (double tap, timeout and retry,
  9   * OkHttp's silent retry on a dropped connection) sends the same random key with every copy:
 10   *
 11   *   first request             runs normally; its response is stored for `ttlSeconds` (24 h)
 12   *   same key, same request    the stored response is sent again (header Idempotent-Replayed: true), nothing runs
 13   *   same key while running    409 IDEMPOTENCY_REQUEST_IN_PROGRESS with Retry-After
 14   *   same key, other request   422 IDEMPOTENCY_KEY_REUSED (a key belongs to exactly one request body)
 15   *
 16   * Keys are scoped to the signed-in user and the endpoint, so this must run AFTER authentication.
 17   * Final answers (2xx and 4xx) are stored. 5xx and the retryable 4xx below are not: the attempt is forgotten and
 18   * the client can retry with the same key.
 19   * A handler that creates data should call `req.idempotency.complete(status, body, { transaction })` inside its
 20   * transaction: the stored response then commits (or rolls back) together with the data, so a crash between the
 21   * commit and the reply can never let a retry create a second copy.
 22   */
 23  export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
 24  const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,255}$/;
 25  const RETRYABLE_STATUSES = new Set([408, 409, 425, 429]);
 26  
 27  /** JSON with object keys sorted, so {a,b} and {b,a} hash the same. */
 28  export const stableStringify = (value) => {
 29    if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
 30    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
 31    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
 32      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
 33  };
 34  
 35  export const hashRequest = (req) => createHash('sha256')
 36    .update(`${req.method} ${req.originalUrl}\n${stableStringify(req.body ?? {})}`)
 37    .digest('hex');
 38  
 39  const fail = (req, res, status, code, message, headers = {}) => {
 40    res.set(headers);
 41    return res.status(status).json({
 42      success: false,
 43      message,
 44      error: message,
 45      code,
 46      ...(req.id && { request_id: req.id }),
 47    });
 48  };
 49  
 50  /**
 51   * @param {object}  [options]
 52   * @param {boolean} [options.required=false]  refuse requests without a key (turn on once every client sends one)
 53   * @param {number}  [options.lockSeconds=60]  after this long a still-running attempt counts as crashed
 54   * @param {number}  [options.ttlSeconds=86400] how long a key and its response are kept
 55   * @param {object}  [options.store]           defaults to the database store
 56   */
 57  export const idempotent = ({ required = false, lockSeconds = 60, ttlSeconds = 24 * 60 * 60, store } = {}) =>
 58    async (req, res, next) => {
 59      const key = req.get(IDEMPOTENCY_HEADER);
 60      if (key === undefined || key === '') {
 61        if (!required) return next();
 62        return fail(req, res, 400, 'IDEMPOTENCY_KEY_REQUIRED', `The ${IDEMPOTENCY_HEADER} header is required for this request.`);
 63      }
 64      if (!KEY_PATTERN.test(key)) {
 65        return fail(req, res, 400, 'INVALID_IDEMPOTENCY_KEY',
 66          `${IDEMPOTENCY_HEADER} must be 8-255 characters of letters, digits, "-", "_", "." or ":" (a UUID is recommended).`);
 67      }
 68      const userId = req.auth?.id ?? req.admin?.id ?? req.user?.id;
 69      if (!userId) return next();   // only reachable if the route has no authentication in front
 70  
 71      const scope = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`.slice(0, 120);
 72      let claim;
 73      let activeStore;
 74      try {
 75        activeStore = store ?? await getDefaultIdempotencyStore();
 76        claim = await activeStore.claim({ userId, scope, key, requestHash: hashRequest(req), lockSeconds, ttlSeconds });
 77      } catch (err) {
 78        // Without the key store we cannot promise "at most once": refuse rather than risk a duplicate
 79        return respondWithError(req, res, err, 'idempotency');
 80      }
 81  
 82      res.set(IDEMPOTENCY_HEADER, key);
 83      if (claim.outcome === 'mismatch') {
 84        return fail(req, res, 422, 'IDEMPOTENCY_KEY_REUSED',
 85          `This ${IDEMPOTENCY_HEADER} was already used for a different request. Use a new key for a new request.`);
 86      }
 87      if (claim.outcome === 'in_progress') {
 88        return fail(req, res, 409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
 89          'The same request is still being processed. Please wait a moment.', { 'Retry-After': String(claim.retryAfter) });
 90      }
 91      if (claim.outcome === 'replay') {
 92        res.set('Idempotent-Replayed', 'true');
 93        return res.status(claim.status).json(claim.body);
 94      }
 95  
 96      // outcome === 'new': run the handler and keep its answer
 97      let savedByHandler = false;
 98      let settled = false;
 99      req.idempotency = {
100        key,
101        complete: async (status, body, { transaction } = {}) => {
102          await activeStore.complete(claim.id, status, body, { transaction });
103          // Saved inside a transaction: it only counts once that transaction commits (a rollback undoes it)
104          if (transaction?.afterCommit) transaction.afterCommit(() => { savedByHandler = true; });
105          else savedByHandler = true;
106        },
107      };
108  
109      const send = res.json.bind(res);
110      res.json = (body) => {
111        if (settled) return send(body);
112        settled = true;
113        const status = res.statusCode;
114        const keep = status < 500 && !RETRYABLE_STATUSES.has(status);
115        const save = savedByHandler
116          ? Promise.resolve()
117          : keep ? activeStore.complete(claim.id, status, body) : activeStore.release(claim.id);
118        save
119          .catch((err) => logger.error(`idempotency: could not ${keep ? 'store' : 'release'} key for ${scope}: ${err.message}`, { request_id: req.id }))
120          .finally(() => send(body));
121        return res;
122      };
123      // A handler that crashed or answered without res.json must not leave the key stuck until the lock expires
124      res.on('close', () => {
125        if (settled || savedByHandler) return;
126        settled = true;
127        activeStore.release(claim.id).catch((err) => logger.error(`idempotency: could not release key for ${scope}: ${err.message}`));
128      });
129      return next();
130    };
```

### `DarhubBackend/services/idempotency.service.js` (whole file)

```js
  1  /**
  2   * Storage for Idempotency-Key records (see middleware/idempotency.js).
  3   *
  4   * claim() decides what to do with an incoming request, atomically, even when several server instances receive the
  5   * same retry at the same moment:
  6   *   new          first time this key is seen (or a crashed attempt is being taken over): run the handler
  7   *   replay       the request already finished: send back the stored status and body
  8   *   in_progress  another copy of the request is running right now
  9   *   mismatch     the key was already used for a DIFFERENT request (other body or path)
 10   *
 11   * Times come from the database clock (now()), so instances with skewed clocks agree.
 12   */
 13  const TABLE = '"IDEMPOTENCY_KEY"';
 14  
 15  export class SqlIdempotencyStore {
 16    constructor(database) {
 17      this.db = database;
 18    }
 19  
 20    async claim({ userId, scope, key, requestHash, lockSeconds, ttlSeconds }) {
 21      const { sequelize, QueryTypes } = this.db;
 22      // Two passes at most: the second runs only after an expired record was removed
 23      for (let attempt = 0; attempt < 2; attempt++) {
 24        const inserted = await sequelize.query(
 25          `INSERT INTO ${TABLE} (user_id, scope, idem_key, request_hash, status, locked_until, expires_at, created_on)
 26           VALUES (:userId, :scope, :key, :requestHash, 'processing',
 27                   now() + make_interval(secs => :lockSeconds), now() + make_interval(secs => :ttlSeconds), now())
 28           ON CONFLICT (user_id, scope, idem_key) DO NOTHING
 29           RETURNING id`,
 30          { replacements: { userId, scope, key, requestHash, lockSeconds, ttlSeconds }, type: QueryTypes.SELECT },
 31        );
 32        if (inserted.length) return { outcome: 'new', id: inserted[0].id };
 33  
 34        const [row] = await sequelize.query(
 35          `SELECT id, request_hash, status, response_status, response_body,
 36                  expires_at < now() AS expired,
 37                  locked_until < now() AS lock_expired,
 38                  GREATEST(1, CEIL(EXTRACT(EPOCH FROM (locked_until - now()))))::int AS lock_seconds_left
 39             FROM ${TABLE} WHERE user_id = :userId AND scope = :scope AND idem_key = :key`,
 40          { replacements: { userId, scope, key }, type: QueryTypes.SELECT },
 41        );
 42        if (!row) continue;                         // removed between the two statements: try the insert again
 43  
 44        if (row.expired) {
 45          await sequelize.query(`DELETE FROM ${TABLE} WHERE id = :id AND expires_at < now()`, { replacements: { id: row.id } });
 46          continue;
 47        }
 48        if (row.request_hash !== requestHash) return { outcome: 'mismatch' };
 49        if (row.status === 'completed') {
 50          return { outcome: 'replay', status: row.response_status, body: row.response_body };
 51        }
 52        if (row.lock_expired) {
 53          // The attempt that held this key died before finishing (crash, deploy). Exactly one retry takes it over.
 54          const taken = await sequelize.query(
 55            `UPDATE ${TABLE} SET locked_until = now() + make_interval(secs => :lockSeconds), modified_on = now()
 56              WHERE id = :id AND status = 'processing' AND locked_until < now()
 57              RETURNING id`,
 58            { replacements: { id: row.id, lockSeconds }, type: QueryTypes.SELECT },
 59          );
 60          if (taken.length) return { outcome: 'new', id: row.id };
 61        }
 62        return { outcome: 'in_progress', retryAfter: row.lock_seconds_left || 1 };
 63      }
 64      return { outcome: 'in_progress', retryAfter: 1 };
 65    }
 66  
 67    /** Stores the final response. Pass `transaction` to save it together with the data the request created. */
 68    async complete(id, status, body, { transaction } = {}) {
 69      const [, meta] = await this.db.sequelize.query(
 70        `UPDATE ${TABLE}
 71            SET status = 'completed', response_status = :status, response_body = CAST(:body AS jsonb),
 72                locked_until = NULL, modified_on = now()
 73          WHERE id = :id AND status = 'processing'`,
 74        { replacements: { id, status, body: JSON.stringify(body ?? null) }, transaction },
 75      );
 76      return (meta?.rowCount ?? 0) > 0;
 77    }
 78  
 79    /** Forgets an attempt that failed in a retryable way, so the client can retry with the same key. */
 80    async release(id) {
 81      await this.db.sequelize.query(`DELETE FROM ${TABLE} WHERE id = :id AND status = 'processing'`, { replacements: { id } });
 82    }
 83  
 84    async purgeExpired() {
 85      const [, meta] = await this.db.sequelize.query(`DELETE FROM ${TABLE} WHERE expires_at < now()`);
 86      return meta?.rowCount ?? 0;
 87    }
 88  }
 89  
 90  // The models are imported on first use, so unit tests that pass their own store never open a database connection.
 91  let sharedStore;
 92  export const getDefaultIdempotencyStore = async () => {
 93    if (!sharedStore) sharedStore = new SqlIdempotencyStore((await import('../models/index.js')).default);
 94    return sharedStore;
 95  };
 96  
 97  /** Same rules in memory, for unit tests. */
 98  export class MemoryIdempotencyStore {
 99    constructor({ now = () => Date.now() } = {}) {
100      this.now = now;
101      this.rows = new Map();
102      this.nextId = 1;
103    }
104  
105    async claim({ userId, scope, key, requestHash, lockSeconds, ttlSeconds }) {
106      const k = `${userId}|${scope}|${key}`;
107      const now = this.now();
108      let row = this.rows.get(k);
109      if (row && row.expiresAt < now) {
110        this.rows.delete(k);
111        row = undefined;
112      }
113      if (!row) {
114        row = { id: this.nextId++, requestHash, status: 'processing', lockedUntil: now + lockSeconds * 1000, expiresAt: now + ttlSeconds * 1000 };
115        this.rows.set(k, row);
116        return { outcome: 'new', id: row.id };
117      }
118      if (row.requestHash !== requestHash) return { outcome: 'mismatch' };
119      if (row.status === 'completed') return { outcome: 'replay', status: row.responseStatus, body: row.responseBody };
120      if (row.lockedUntil < now) {
121        row.lockedUntil = now + lockSeconds * 1000;
122        return { outcome: 'new', id: row.id };
123      }
124      return { outcome: 'in_progress', retryAfter: Math.max(1, Math.ceil((row.lockedUntil - now) / 1000)) };
125    }
126  
127    #byId(id) {
128      for (const row of this.rows.values()) if (row.id === id) return row;
129      return undefined;
130    }
131  
132    async complete(id, status, body) {
133      const row = this.#byId(id);
134      if (!row || row.status !== 'processing') return false;
135      Object.assign(row, { status: 'completed', responseStatus: status, responseBody: JSON.parse(JSON.stringify(body ?? null)), lockedUntil: null });
136      return true;
137    }
138  
139    async release(id) {
140      for (const [k, row] of this.rows) if (row.id === id && row.status === 'processing') this.rows.delete(k);
141    }
142  
143    async purgeExpired() {
144      let n = 0;
145      for (const [k, row] of this.rows) if (row.expiresAt < this.now()) { this.rows.delete(k); n++; }
146      return n;
147    }
148  }
```

### `DarhubBackend/models/IdempotencyKey.js` (whole file)

```js
 1  /**
 2   * One row per Idempotency-Key a client sent (see middleware/idempotency.js).
 3   * The key is unique per user and per endpoint, so two users (or two endpoints) can never collide.
 4   */
 5  const IdempotencyKey = (sequelize, DataTypes) => sequelize.define('IdempotencyKey', {
 6    id: {
 7      type: DataTypes.BIGINT,
 8      primaryKey: true,
 9      autoIncrement: true,
10    },
11    user_id: {
12      type: DataTypes.INTEGER,
13      allowNull: false,
14    },
15    scope: {
16      type: DataTypes.STRING(120),          // "POST /order/create-order"
17      allowNull: false,
18    },
19    idem_key: {
20      type: DataTypes.STRING(255),
21      allowNull: false,
22    },
23    request_hash: {
24      type: DataTypes.STRING(64),           // sha256 of method + path + body: the same key may not be reused for another request
25      allowNull: false,
26    },
27    status: {
28      type: DataTypes.STRING(20),           // processing | completed
29      allowNull: false,
30      defaultValue: 'processing',
31    },
32    response_status: {
33      type: DataTypes.INTEGER,
34      allowNull: true,
35    },
36    response_body: {
37      type: DataTypes.JSONB,
38      allowNull: true,
39    },
40    locked_until: {
41      type: DataTypes.DATE,                 // a request still "processing" after this moment crashed; a retry may take over
42      allowNull: true,
43    },
44    expires_at: {
45      type: DataTypes.DATE,
46      allowNull: false,
47    },
48    created_on: {
49      type: DataTypes.DATE,
50      allowNull: false,
51      defaultValue: DataTypes.NOW,
52    },
53    modified_on: {
54      type: DataTypes.DATE,
55      allowNull: true,
56    },
57  }, {
58    tableName: 'IDEMPOTENCY_KEY',
59    timestamps: false,
60    indexes: [
61      { unique: true, fields: ['user_id', 'scope', 'idem_key'], name: 'idempotency_key_user_scope_key_uq' },
62      { fields: ['expires_at'], name: 'idempotency_key_expires_at_idx' },
63    ],
64  });
65  
66  export default IdempotencyKey;
```

### `DarhubBackend/migrations/004_idempotency_keys.sql` (whole file)

```sql
 1  -- 004_idempotency_keys.sql
 2  --
 3  -- Storage for the Idempotency-Key header (middleware/idempotency.js): a retried or double-tapped booking request
 4  -- returns the first response instead of creating a second booking.
 5  -- The server also creates this table on boot (sequelize.sync creates missing tables), so this file is for
 6  -- environments whose schema is managed by hand. New, empty table: nothing to lock or clean.
 7  -- Idempotent: safe to run more than once.
 8  --   node scripts/apply-sql.js migrations/004_idempotency_keys.sql --apply
 9  
10  CREATE TABLE IF NOT EXISTS "IDEMPOTENCY_KEY" (
11    id               BIGSERIAL PRIMARY KEY,
12    user_id          INTEGER      NOT NULL,
13    scope            VARCHAR(120) NOT NULL,
14    idem_key         VARCHAR(255) NOT NULL,
15    request_hash     VARCHAR(64)  NOT NULL,
16    status           VARCHAR(20)  NOT NULL DEFAULT 'processing',
17    response_status  INTEGER,
18    response_body    JSONB,
19    locked_until     TIMESTAMPTZ,
20    expires_at       TIMESTAMPTZ  NOT NULL,
21    created_on       TIMESTAMPTZ  NOT NULL DEFAULT now(),
22    modified_on      TIMESTAMPTZ
23  );
24  
25  CREATE UNIQUE INDEX IF NOT EXISTS idempotency_key_user_scope_key_uq ON "IDEMPOTENCY_KEY" (user_id, scope, idem_key);
26  CREATE INDEX IF NOT EXISTS idempotency_key_expires_at_idx ON "IDEMPOTENCY_KEY" (expires_at);
```

## B2. Backend: integration

### `DarhubBackend/controllers/Admin.controller.js` (lines 1186-1367)

`createOrder`: the transaction that stores the idempotent response together with the order. (`resolveWorkingDays` and the 60-day cap belong to a separate fix in the same change.)

```js
1186  // GST added to the crop price. The Farmer app shows the farmer price + 5% and the order must be stored at that
1187  // same amount, so the rate lives here on the server instead of being sent by the client.
1188  const ORDER_TAX_RATE = Number(process.env.ORDER_TAX_RATE ?? 0.05);
1189  const roundMoney = (value) => Math.round(value * 100) / 100;
1190  
1191  // Requires a signed-in user (see orderRoutes.js). A farmer can only book for themselves; an admin books on a
1192  // farmer's behalf. The price is calculated here: the client's price/tax/discount/total are only honoured for admins.
1193  export const createOrder = async (req, res) => {
1194    try {
1195      const caller = req.auth;
1196      const body = parseOrThrow(createOrderSchema, req.body);
1197      const { start_date: startDateObj, crop_type_id, land_in_acers: landAcres, num_of_days, address, farmer_details } = body;
1198  
1199      // ── Who is the order for? ─────────────────────────────────────────
1200      let finalUserId;
1201      if (!caller.isAdmin) {
1202        finalUserId = caller.id;              // user_id / farmer_details in the request are ignored on purpose
1203      } else if (body.user_id) {
1204        finalUserId = Number(body.user_id);
1205        if (!Number.isInteger(finalUserId) || !(await User.findByPk(finalUserId, { attributes: ["id"] }))) {
1206          return res.status(400).json({ error: "user_id does not match an existing user" });
1207        }
1208      } else if (farmer_details?.mobile) {
1209        finalUserId = null;                   // resolved inside the transaction below
1210      } else {
1211        return res.status(400).json({ error: "Missing required fields" });
1212      }
1213  
1214      // start_date (a calendar date stored as UTC midnight, today or later in India), crop_type_id, land_in_acers
1215      // (0 < acres <= 1000), num_of_days (1-60) and the address shape were checked by createOrderSchema.
1216      const crop = await db.MasterCrop.findByPk(crop_type_id);
1217      if (!crop || crop.is_active === false) {
1218        return res.status(400).json({ error: "Invalid crop_type_id" });
1219      }
1220  
1221      // The state -> district -> block chain must exist and belong together
1222      const problem = await checkLocationChain(db, address);
1223      if (problem) return res.status(400).json({ error: `address: ${problem}` });
1224  
1225      // Working days come from the admin's acreage bands (fractions and gaps take the next band up, larger fields are
1226      // extrapolated). A farmer's num_of_days is ignored; an admin's only applies when no band exists.
1227      const bands = await db.MasterWorkingDays.findAll({
1228        where: { is_active: true },
1229        attributes: ["id", "min_acre", "max_acre", "working_days"],
1230        raw: true,
1231      });
1232      const { days: calculatedNumOfDays } = resolveWorkingDays(landAcres, bands, {
1233        requestedDays: caller.isAdmin ? num_of_days : undefined,
1234      });
1235      if (calculatedNumOfDays > MAX_ORDER_DAYS) {
1236        const tooLarge = new ApiError(400,
1237          `${landAcres} acres needs ${calculatedNumOfDays} working days, more than the ${MAX_ORDER_DAYS}-day maximum for one booking. ` +
1238          `Please split the area into smaller bookings or contact support.`);
1239        tooLarge.code = "BOOKING_TOO_LARGE";
1240        throw tooLarge;
1241      }
1242  
1243      // end_date = start_date + (working_days - 1), pure UTC calendar arithmetic
1244      const calculatedEndDate = addDaysUTC(startDateObj, calculatedNumOfDays - 1);
1245  
1246      // ── Price: calculated by the server ────────────────────────────────
1247      const basePrice = roundMoney(parseFloat(crop.price_per_acre || 0) * landAcres);
1248      let orderPrice = basePrice;
1249      let orderTax = roundMoney(basePrice * ORDER_TAX_RATE);
1250      let orderDiscount = 0;
1251      if (caller.isAdmin) {
1252        const money = (value, fallback, label) => {
1253          if (value === undefined || value === null || value === "") return fallback;
1254          const n = Number(value);
1255          if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `${label} must be a number of 0 or more`);
1256          return roundMoney(n);
1257        };
1258        orderPrice = money(body.price, basePrice, "price");
1259        orderTax = money(body.tax, roundMoney(orderPrice * ORDER_TAX_RATE), "tax");
1260        orderDiscount = money(body.discount, 0, "discount");
1261        if (orderDiscount > orderPrice + orderTax) throw new ApiError(400, "discount cannot be more than the price plus tax");
1262      }
1263      const orderTotal = roundMoney(orderPrice + orderTax - orderDiscount);
1264  
1265      const bookingId = uuidv4();
1266      const autoVerified = !caller.isAdmin;   // the farmer's own login already proves who is booking
1267      const bookingOtp = autoVerified ? null : generateOtp();
1268      const responseBody = {
1269        message: "Order and address created successfully",
1270        booking_id: bookingId,
1271        order_status: autoVerified ? OrderStatusEnum.WAITING_FOR_CONFIRMATION : OrderStatusEnum.ORDER_PLACED,
1272        otp_required: !autoVerified,
1273        num_of_days: calculatedNumOfDays,
1274        start_date: toYMD(startDateObj),
1275        end_date: toYMD(calculatedEndDate),
1276        price: orderPrice,
1277        tax: orderTax,
1278        discount: orderDiscount,
1279        total_price: orderTotal,
1280        dev_otp: !autoVerified && env.EXPOSE_DEV_OTPS ? bookingOtp : undefined,
1281      };
1282  
1283      // ── Order, timeline and address are saved together or not at all ─────
1284      await db.sequelize.transaction(async (t) => {
1285        let userId = finalUserId;
1286        if (!userId) {
1287          // Admin booking for a farmer who has no account yet: create a placeholder account that cannot be signed
1288          // into until the farmer sets a password (it used to get the fixed password "12345678").
1289          const mobile = normalizeMobile(farmer_details.mobile);
1290          if (!mobile) throw new ApiError(400, "farmer_details.mobile must be a 10 digit mobile number");
1291          const email = farmer_details.email ? normalizeEmail(farmer_details.email) : null;
1292          if (email && !isValidEmail(email)) throw new ApiError(400, "farmer_details.email is not a valid email address");
1293  
1294          await lockIdentifiers(db.sequelize, t, [mobile, email].filter(Boolean));
1295          // Any stored spelling of the number ("09798297100", "+919798297100"): looking only for the exact 10 digits made
1296          // a second account for a farmer who was already registered under an older spelling
1297          let farmer = (await findAccountsByIdentity({ User }, { mobile }, t))[0];
1298          if (!farmer) {
1299            farmer = await User.create({
1300              username: String(farmer_details.name || "Farmer").slice(0, 50),
1301              mobile_number: mobile,
1302              email,
1303              user_type: 3,
1304              password: await bcrypt.hash(randomInt(0, 2 ** 31).toString(36) + uuidv4(), 10),
1305              created_by: caller.id,
1306            }, { transaction: t });
1307            await db.UserProfile.create({ user_id: farmer.id, first_name: String(farmer_details.name || "Farmer").slice(0, 60), created_by: caller.id }, { transaction: t });
1308          }
1309          userId = farmer.id;
1310        }
1311  
1312        await SprayingOrder.create({
1313          booking_id: bookingId,
1314          start_date: startDateObj,
1315          end_date: calculatedEndDate,
1316          num_of_days: calculatedNumOfDays,
1317          crop_type_id,
1318          land_in_acers: landAcres,
1319          price: orderPrice,
1320          tax: orderTax,
1321          total_price: orderTotal,
1322          cupon_id: null,                       // coupons are not implemented; it used to be filled with a made-up id (13)
1323          discount: orderDiscount,
1324          user_id: userId,
1325          order_status: OrderStatusEnum.ORDER_PLACED,
1326          is_paid: false,
1327          transcation_id: null,
1328          booking_otp: bookingOtp,
1329          created_on: new Date(),
1330          created_by: caller.isAdmin ? caller.id : userId,
1331        }, { transaction: t });
1332  
1333        await db.SprayingOrderTimeline.create({
1334          booking_id: bookingId,
1335          order_status: OrderStatusEnum.ORDER_PLACED,
1336          remarks: caller.isAdmin ? 'Order placed by admin' : 'Order Placed',
1337          created_by: caller.id,
1338        }, { transaction: t });
1339  
1340        if (autoVerified) {
1341          await updateOrderStatus(bookingId, OrderStatusEnum.WAITING_FOR_CONFIRMATION, "Order confirmed by farmer", userId, t);
1342        }
1343  
1344        await SprayingOrderAddress.create({
1345          order_id: bookingId,
1346          state: address.state,
1347          district: address.district,
1348          block: address.block,
1349          village: address.village,
1350          lane1: address.lane1 || address.address1,
1351          lane2: address.lane2 || address.address2,
1352          address1: address.address1 || address.lane1,
1353          address2: address.address2 || address.lane2,
1354          pincode: address.pincode,
1355        }, { transaction: t });
1356  
1357        // Idempotency-Key: the response is stored in the same transaction as the order, so a retry after a crash
1358        // or a lost reply gets this booking back instead of creating a second one
1359        await req.idempotency?.complete(201, responseBody, { transaction: t });
1360      });
1361  
1362      return res.status(201).json(responseBody);
1363  
1364    } catch (error) {
1365      return respondWithError(req, res, error, "createOrder");
1366    }
1367  };
```

### `DarhubBackend/routes/orderRoutes.js` (lines 42-72)

Mounting order: authentication first, then the middleware.

```js
42  const asUser = authenticateUser;
43  const asAdmin = authenticateAdmin;
44  // Idempotency-Key (see middleware/idempotency.js): a retried or double-tapped request returns the first result
45  // instead of creating a second booking / assignment
46  const onceOnly = idempotent({ required: env.IDEMPOTENCY_KEY_REQUIRED });
47  
48  // ── Orders: farmer or admin ──────────────────────────────────────────
49  orderRouter.post("/create-order",             asUser, onceOnly, createOrder);
50  orderRouter.get("/statuses",                  asUser, getAllOrderStatuses);
51  orderRouter.post("/filterOrder",              asUser, scopeBodyToCaller, filterOrders);      // farmers only ever see their own
52  orderRouter.get("/getOrderByUserId/:user_id", asUser, requireSelfOrAdmin("user_id"), getOrdersByUserId);
53  orderRouter.post("/verify-otp",               asUser, verifyOrderOTP);
54  orderRouter.post("/resend-otp",               asUser, resendOrderOTP);
55  
56  // ── Orders: admin only ───────────────────────────────────────────────
57  orderRouter.get("/get-order",                 asAdmin, getOrders);
58  orderRouter.get("/getOrderById/:booking_id",  asAdmin, getOrderById);
59  orderRouter.post("/filter-orders",            asAdmin, filterOrders);
60  orderRouter.post("/updateOrder",              asAdmin, updateOrder);
61  orderRouter.post("/deleteOrder",              asAdmin, deleteOrderById);
62  
63  // ── Crops ────────────────────────────────────────────────────────────
64  orderRouter.get("/crops/list", asUser, getAllCropsForSelect);
65  
66  // ── Availability & assignment ─────────────────────────────────────────
67  // Step 1 — open Assign or Edit modal
68  orderRouter.post("/calendar-availability", asAdmin, getCalendarAvailability);
69  orderRouter.post("/drone-availability", asUser, getDroneAvailabilityForBooking);
70  
71  // Step 2a — New assignment (or add more dates to existing)
72  orderRouter.post("/assign-work/:booking_id", asAdmin, idempotent(), assignWork);
```

### `DarhubBackend/routes/farmerRoutes.js` (lines 55-55)

All farmer routes are authenticated at router level:

```js
55  farmerRouter.use(authenticateUser, requireFarmer);
```

### `DarhubBackend/routes/farmerRoutes.js` (lines 147-154)

```js
147  farmerRouter.post('/bookings/:booking_id/cancel', byBooking, validate({ body: cancelBookingSchema }), idempotent(), cancelFarmerBooking);
148  
149  /**
150   * PATCH /api/farmer/bookings/:booking_id/reschedule
151   * Body: { new_date: "2026-05-28", new_time_window: "10:00 AM - 12:00 PM" }
152   * Farmer reschedules an UPCOMING booking (opens RescheduleBookingFragment).
153   */
154  farmerRouter.patch('/bookings/:booking_id/reschedule', byBooking, validate({ body: rescheduleBookingSchema }), idempotent(), rescheduleFarmerBooking);
```

### `DarhubBackend/cron/jobs.js` (lines 61-79)

Nightly cleanup (runs in the 02:30 IST job):

```js
61    cron.schedule('30 2 * * *', async () => {
62      try {
63        const removed = await db.OtpVerification.destroy({
64          where: { created_on: { [db.Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
65        });
66        if (removed) console.log(`[cron] Removed ${removed} expired OTP records.`);
67      } catch (error) {
68        console.error('Error in OTP cleanup cron job:', error);
69      }
70      try {
71        // Idempotency keys live 24 h; after that a retry is a new request anyway
72        const purged = await db.IdempotencyKey.destroy({ where: { expires_at: { [db.Op.lt]: new Date() } } });
73        if (purged) console.log(`[cron] Removed ${purged} expired idempotency keys.`);
74      } catch (error) {
75        console.error('Error in idempotency-key cleanup cron job:', error);
76      }
77    }, { timezone: IST_TIMEZONE });
78  
79    // Every day at 23:59 India time: close the days the pilot started but did not end.
```

### `DarhubBackend/app.js` (lines 92-106)

App-level middleware order. `hideServerErrorDetails` also wraps `res.json`, and it is installed before the idempotency wrapper:

```js
 92  app.use(hideServerErrorDetails);
 93  app.use(helmet());
 94  
 95  // CORS before the rate limiters: a 429 without CORS headers shows up in the browser as a confusing CORS error.
 96  const allowedOrigins = [
 97    "http://localhost:5173",
 98    "http://localhost:3000",
 99    "http://localhost:3001",
100    "http://localhost:5174",
101    "https://darhubfrontend.onrender.com",
102    "https://darhubadmin.onrender.com",
103    ...env.CORS_ORIGINS,
104  ];
105  // Browsers may only read these response headers when they are listed (request id for support, idempotent replays)
106  app.use(cors({ origin: allowedOrigins, credentials: true, exposedHeaders: ['X-Request-Id', 'Idempotency-Key', 'Idempotent-Replayed', 'Retry-After'] }));
```

### `DarhubBackend/middleware/errorHandler.js` (lines 63-83)

Error responses (used by the middleware for store failures):

```js
63  export const respondWithError = (req, res, err, context = '') => {
64    const { status, code, message, errors, retry } = classify(err);
65  
66    const line = `${context ? `${context}: ` : ''}[${req.method}] ${req.originalUrl} -> ${status} ${err?.message || err}`;
67    if (status >= 500) logger.error(line, { stack: err?.stack, request_id: req.id, user_id: req.pilot?.id ?? req.user?.id ?? req.admin?.id });
68    else logger.warn(line, { request_id: req.id });
69  
70    if (res.headersSent) return undefined;
71    if (retry) res.set('Retry-After', '5');
72    return res.status(status).json({
73      success: false,
74      message,
75      error: message,
76      ...(code && { code }),
77      ...(errors?.length && { errors }),
78      ...(req.id && { request_id: req.id }),
79    });
80  };
81  
82  /** Express error middleware (must be registered last). */
83  // eslint-disable-next-line no-unused-vars
```

### `DarhubBackend/middleware/errorHandler.js` (lines 101-117)

```js
101  export const hideServerErrorDetails = (req, res, next) => {
102    const send = res.json.bind(res);
103    res.json = (body) => {
104      if (!isProduction() || res.statusCode < 500 || body?.code === 'INTERNAL_ERROR' || body?.code === 'DATABASE_UNAVAILABLE') {
105        return send(body);
106      }
107      logger.error(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (details hidden from client): ${JSON.stringify(body)?.slice(0, 500)}`, { request_id: req.id });
108      return send({
109        success: false,
110        message: GENERIC_MESSAGE,
111        error: GENERIC_MESSAGE,
112        code: 'INTERNAL_ERROR',
113        ...(req.id && { request_id: req.id }),
114      });
115    };
116    next();
117  };
```

### `DarhubBackend/config/env.js` (lines 73-74)

```js
73    // Refuse booking requests without an Idempotency-Key header. Leave off until every app version in use sends one.
74    IDEMPOTENCY_KEY_REQUIRED: Joi.boolean().default(false),
```

## B3. Farmer Android app (Kotlin)

### `Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/data/network/IdempotencyKeys.kt` (whole file)

```kotlin
 1  package com.darhub.darhubfarmer.data.network
 2  
 3  import java.util.UUID
 4  
 5  /** Header the backend uses to run a request at most once (a retry gets the first answer back). */
 6  const val IDEMPOTENCY_HEADER = "Idempotency-Key"
 7  
 8  /**
 9   * One Idempotency-Key per distinct request. Sending the SAME request again (Confirm tapped twice, retry after a
10   * timeout or a dropped connection) reuses the key, so the server returns the booking it already made instead of
11   * creating a second one. A request with different content gets a new key: the server refuses a key that is reused
12   * for another body. Call [clear] once the request succeeded, so the next booking is a new one.
13   */
14  class IdempotencyKeyHolder(private val newKey: () -> String = { UUID.randomUUID().toString() }) {
15      private var request: Any? = null
16      private var key: String? = null
17  
18      @Synchronized
19      fun keyFor(request: Any): String {
20          val current = key
21          if (current != null && request == this.request) return current
22          return newKey().also {
23              this.request = request
24              key = it
25          }
26      }
27  
28      @Synchronized
29      fun clear() {
30          request = null
31          key = null
32      }
33  }
34  
35  /** The same key for the same action on the same thing, every time (e.g. cancelling booking X with reason Y). */
36  fun stableIdempotencyKey(vararg parts: String): String =
37      UUID.nameUUIDFromBytes(parts.joinToString("|").toByteArray(Charsets.UTF_8)).toString()
```

### `Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/data/network/ApiService.kt` (lines 170-175)

```kotlin
170      @POST("api/farmer/bookings/{booking_id}/cancel")
171      suspend fun cancelFarmerBooking(
172          @Path("booking_id") bookingId: String,
173          @Body request: CancelBookingRequest,
174          @Header(IDEMPOTENCY_HEADER) idempotencyKey: String
175      ): Response<ApiResponse<Unit>>
```

### `Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/data/network/ApiService.kt` (lines 217-221)

```kotlin
217      @POST("order/create-order")
218      suspend fun createOrder(
219          @Body request: CreateOrderRequest,
220          @Header(IDEMPOTENCY_HEADER) idempotencyKey: String
221      ): Response<CreateOrderResponse>
```

### `Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/data/repository/OrderRepository.kt` (lines 45-48)

```kotlin
45      /** [idempotencyKey]: the same key for every retry of this booking (see IdempotencyKeyHolder). */
46      suspend fun createOrder(request: CreateOrderRequest, idempotencyKey: String): Response<CreateOrderResponse> {
47          return apiService.createOrder(request, idempotencyKey)
48      }
```

### `Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/data/repository/OrderRepository.kt` (lines 78-81)

```kotlin
78      suspend fun cancelFarmerBooking(bookingId: String, reason: String): Response<ApiResponse<Unit>> {
79          // A booking is cancelled once: a retry of the same cancellation gets the first answer back
80          return apiService.cancelFarmerBooking(bookingId, CancelBookingRequest(reason), stableIdempotencyKey("cancel", bookingId, reason))
81      }
```

### `Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/ui/home/booking/BookingViewModel.kt` (lines 15-18)

```kotlin
15  
16      private companion object {
17          const val MAX_IN_PROGRESS_WAITS = 6
18      }
```

### `Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/ui/home/booking/BookingViewModel.kt` (lines 68-121)

```kotlin
 68      // Same key for every retry of the same booking: if the first attempt reached the server but the answer was lost
 69      // (timeout, dropped connection, server waking up), the retry returns that booking instead of making a second one.
 70      private val orderKeys = IdempotencyKeyHolder()
 71      private var createOrderJob: Job? = null
 72  
 73      fun createOrder(request: CreateOrderRequest) {
 74          if (createOrderJob?.isActive == true) return          // a second tap while the first is still running
 75          val key = orderKeys.keyFor(request)
 76          createOrderJob = viewModelScope.launch {
 77              try {
 78                  var response = repository.createOrder(request, key)
 79                  var errorJson = errorJsonOf(response)            // an error body can be read only once
 80                  // The same booking is still being created (an earlier attempt is running): wait and ask again
 81                  var waits = 0
 82                  while (response.code() == 409 && errorJson?.optString("code") == "IDEMPOTENCY_REQUEST_IN_PROGRESS" &&
 83                      waits < MAX_IN_PROGRESS_WAITS
 84                  ) {
 85                      val seconds = response.headers()["Retry-After"]?.toLongOrNull() ?: 2L
 86                      delay(seconds.coerceIn(1L, 5L) * 1000)
 87                      waits++
 88                      response = repository.createOrder(request, key)
 89                      errorJson = errorJsonOf(response)
 90                  }
 91                  if (response.isSuccessful) {
 92                      orderKeys.clear()                            // the next booking is a new one
 93                      _createOrderResponse.postValue(response.body())
 94                  } else {
 95                      _error.postValue(messageOf(errorJson) ?: "Failed to create order")
 96                  }
 97              } catch (e: Exception) {
 98                  // The key is kept: tapping Confirm again safely retries the same booking
 99                  _error.postValue(e.message ?: "Network error")
100              }
101          }
102      }
103  
104      private fun errorJsonOf(response: retrofit2.Response<*>): org.json.JSONObject? =
105          if (response.isSuccessful) null
106          else try {
107              org.json.JSONObject(response.errorBody()?.string().orEmpty())
108          } catch (_: Exception) {
109              null
110          }
111  
112      private fun messageOf(json: org.json.JSONObject?): String? =
113          json?.optString("error")?.ifEmpty { json.optString("message") }?.ifEmpty { null }
114  
115      /** Called once the screen has acted on the response, so it is not replayed on a re-observe. */
116      fun consumeCreateOrderResponse() {
117          _createOrderResponse.value = null
118      }
119  
120      /** The backend explains validation failures ("start_date cannot be in the past"); show that. */
121      private fun serverMessage(response: retrofit2.Response<*>): String? = messageOf(errorJsonOf(response))
```

### `Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/ui/home/booking/BookStep3Fragment.kt` (lines 262-297)

How the request is built on every tap (equal content means an equal `data class`, so the same key is reused):

```kotlin
262          binding.btnConfirmBookingFinal.setOnClickListener {
263              // Spinner in the button (it also ignores taps) until the order is created
264              setConfirmLoading(true)
265              processBookingWithRealApi()
266          }
267      }
268  
269      private fun processBookingWithRealApi() {
270          val user = sessionManager.getUserDetails()
271          
272          val request = CreateOrderRequest(
273              startDate = appViewModel.bookingDateBackend.value ?: "",
274              cropTypeId = appViewModel.bookingCropId.value ?: 0,
275              landInAcres = appViewModel.bookingFarmArea.value?.toDoubleOrNull() ?: 0.0,
276              price = appViewModel.bookingTotalCost.value?.toDoubleOrNull() ?: 0.0,
277              tax = appViewModel.bookingTax.value ?: 0.0,
278              totalPrice = (appViewModel.bookingTotalCost.value?.toDoubleOrNull() ?: 0.0) + (appViewModel.bookingTax.value ?: 0.0),
279              discount = appViewModel.bookingDiscount.value ?: 0.0,
280              userId = user.id,
281              farmerDetails = OrderFarmerDetails(
282                  name = user.name,
283                  mobile = user.phone,
284                  email = user.email
285              ),
286              address = OrderAddress(
287                  state = appViewModel.bookingStateId.value ?: 0,
288                  district = appViewModel.bookingDistrictId.value ?: 0,
289                  block = appViewModel.bookingBlockId.value ?: 0,
290                  village = appViewModel.bookingVillage.value ?: "",
291                  address1 = appViewModel.bookingFarmName.value ?: "Farm",
292                  address2 = null
293              )
294          )
295  
296          bookingViewModel.createOrder(request)
297      }
```

### `Darhub-Farmer-App/app/src/test/java/com/darhub/darhubfarmer/IdempotencyKeysTest.kt` (whole file)

```kotlin
 1  package com.darhub.darhubfarmer
 2  
 3  import com.darhub.darhubfarmer.data.network.IdempotencyKeyHolder
 4  import com.darhub.darhubfarmer.data.network.models.CreateOrderRequest
 5  import com.darhub.darhubfarmer.data.network.models.OrderAddress
 6  import com.darhub.darhubfarmer.data.network.models.OrderFarmerDetails
 7  import com.darhub.darhubfarmer.data.network.stableIdempotencyKey
 8  import org.junit.Assert.assertEquals
 9  import org.junit.Assert.assertNotEquals
10  import org.junit.Assert.assertTrue
11  import org.junit.Test
12  
13  class IdempotencyKeysTest {
14  
15      private fun order(acres: Double = 3.0) = CreateOrderRequest(
16          startDate = "2026-11-10", cropTypeId = 2, landInAcres = acres, price = 4500.0, tax = 225.0,
17          totalPrice = 4725.0, discount = 0.0, userId = 7,
18          farmerDetails = OrderFarmerDetails("Ramesh", "9000000101", "r@example.com"),
19          address = OrderAddress(state = 34, district = 103, block = 57, village = "Moraiya", address1 = "Farm", address2 = null),
20      )
21  
22      @Test
23      fun `the same booking sent again (a retry) reuses its key`() {
24          val keys = IdempotencyKeyHolder()
25          // a new request object with the same content, as BookStep3 builds on every tap
26          assertEquals(keys.keyFor(order()), keys.keyFor(order()))
27      }
28  
29      @Test
30      fun `a changed booking gets a new key`() {
31          val keys = IdempotencyKeyHolder()
32          assertNotEquals(keys.keyFor(order(3.0)), keys.keyFor(order(4.0)))
33      }
34  
35      @Test
36      fun `after a successful booking the same details make a new booking`() {
37          val keys = IdempotencyKeyHolder()
38          val first = keys.keyFor(order())
39          keys.clear()
40          assertNotEquals(first, keys.keyFor(order()))
41      }
42  
43      @Test
44      fun `keys are UUIDs the server accepts`() {
45          val key = IdempotencyKeyHolder().keyFor(order())
46          assertTrue(key, Regex("^[A-Za-z0-9_.:-]{8,255}$").matches(key))
47      }
48  
49      @Test
50      fun `cancelling the same booking for the same reason always uses the same key`() {
51          assertEquals(stableIdempotencyKey("cancel", "b-1", "Bad weather"), stableIdempotencyKey("cancel", "b-1", "Bad weather"))
52          assertNotEquals(stableIdempotencyKey("cancel", "b-1", "Bad weather"), stableIdempotencyKey("cancel", "b-2", "Bad weather"))
53          assertNotEquals(stableIdempotencyKey("cancel", "b-1", "Bad weather"), stableIdempotencyKey("cancel", "b-1", "Other"))
54      }
55  }
```

## B4. Admin panel (React)

### `DarhubAdmin/src/api/idempotency.js` (whole file)

```js
 1  // ─────────────────────────────────────────────────────────────
 2  // Idempotency-Key for requests that create something (orders, work assignments).
 3  // The backend runs a request with a given key at most once and answers a repeat with the first result, so a
 4  // double click, or "Confirm" pressed again after a timeout or a partial failure, never books twice.
 5  // ─────────────────────────────────────────────────────────────
 6  
 7  export const IDEMPOTENCY_HEADER = "Idempotency-Key";
 8  
 9  export const newIdempotencyKey = () => {
10    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
11    // randomUUID needs a secure context (https / localhost); fall back to the same format from random bytes
12    const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
13    b[6] = (b[6] & 0x0f) | 0x40;
14    b[8] = (b[8] & 0x3f) | 0x80;
15    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
16    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
17  };
18  
19  /**
20   * One key per distinct request body: sending the same body again reuses its key (a safe retry), a different body
21   * gets a new key (the server refuses a key reused for another request). Call clear() after the whole action
22   * succeeded, so the next one is new.
23   */
24  export const createIdempotencyKeys = () => {
25    const keys = new Map();
26    return {
27      keyFor(body) {
28        const id = typeof body === "string" ? body : JSON.stringify(body);
29        if (!keys.has(id)) keys.set(id, newIdempotencyKey());
30        return keys.get(id);
31      },
32      clear() {
33        keys.clear();
34      },
35    };
36  };
37  
38  /** The server is still running an earlier copy of this request: true when the caller should wait and resend. */
39  export const isStillProcessing = (status, body) => status === 409 && body?.code === "IDEMPOTENCY_REQUEST_IN_PROGRESS";
40  
41  /** Seconds to wait before resending, from the Retry-After header (1-5 s). */
42  export const retryAfterSeconds = (headerValue) => Math.min(5, Math.max(1, Number(headerValue) || 2));
```

### `DarhubAdmin/src/components/CreateOrder/Step4.jsx` (lines 1-7)

```jsx
1  import React, { useRef, useState } from 'react';
2  import axios from 'axios';
3  import { API_CONFIG } from "../../api/api";
4  import { IDEMPOTENCY_HEADER, createIdempotencyKeys, isStillProcessing, retryAfterSeconds } from "../../api/idempotency";
5  
6  const MAX_IN_PROGRESS_WAITS = 6;
7  const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
```

### `DarhubAdmin/src/components/CreateOrder/Step4.jsx` (lines 16-17)

```jsx
16      // Same key while the same order is retried (double click, timeout): the server returns the order it already made
17      const orderKeys = useRef(createIdempotencyKeys());
```

### `DarhubAdmin/src/components/CreateOrder/Step4.jsx` (lines 69-132)

```jsx
 69      const proceedToCreateOrder = async () => {
 70          if (isCreating) return;
 71          setIsCreating(true);
 72          try {
 73              const formatDate = (d) => {
 74                  const dt = new Date(d);
 75                  return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
 76              };
 77  
 78              const payload = {
 79                  // The number of days comes from the server's working-days rules (it used to be forced to 1 here)
 80                  start_date: formatDate(service.date),
 81                  crop_type_id: Number(service.cropId) || 1,
 82                  land_in_acers: Number(farm.area) || 0,
 83                  price: Number(service.subTotal),
 84                  tax: Number(service.gst),
 85                  total_price: Number(service.total),
 86                  discount: Number(service.discount),
 87                  cupon_id: null,
 88                  user_id: farmer.farmerId || null,
 89                  farmer_details: {
 90                      name: farmer.name,
 91                      mobile: farmer.mobile,
 92                      email: farmer.email
 93                  },
 94                  address: {
 95                      state: Number(farm.state) || 1,
 96                      district: Number(farm.district) || 1,
 97                      block: Number(farm.block) || 1,
 98                      village: farm.village || "",
 99                      address1: farm.name || "",
100                      address2: ""
101                  }
102              };
103  
104              console.log("FINAL PAYLOAD:", payload);
105  
106              const headers = { [IDEMPOTENCY_HEADER]: orderKeys.current.keyFor(payload) };
107              const send = () => axios.post(`${API_CONFIG.BASE_URL}/order/create-order`, payload, { headers, validateStatus: () => true });
108              let res = await send();
109              // An earlier copy of this order is still being created: wait and ask again for its result
110              for (let waits = 0; isStillProcessing(res.status, res.data) && waits < MAX_IN_PROGRESS_WAITS; waits++) {
111                  await wait(retryAfterSeconds(res.headers?.["retry-after"]));
112                  res = await send();
113              }
114              if (res.status >= 400) {
115                  throw new Error(res.data?.message || res.data?.error || `Server error ${res.status}`);
116              }
117              orderKeys.current.clear();
118  
119              if (res.data && res.data.booking_id) {
120                  onSubmit(res.data.booking_id); // This will trigger OTP modal
121              } else {
122                  throw new Error("Order creation failed");
123              }
124          } catch (error) {
125              console.error(error);
126              alert("Failed to create order: " + error.message);
127              setIsVerifyingOtp(false);
128              setShowOtpModal(false);
129          } finally {
130              setIsCreating(false);
131          }
132      };
```

### `DarhubAdmin/src/pages/Orders.jsx` (lines 482-514)

```jsx
482  /**
483   * POSTs one drone group of an assignment. Each group keeps its Idempotency-Key until the whole save succeeds, so
484   * pressing Confirm again after a failure replays the groups that were already saved instead of answering
485   * "already booked" for them, and only retries the rest.
486   */
487  async function postAssignment(bookingId, grp, keys) {
488    const body = JSON.stringify({
489      pilot:        grp.pilot?.id   ? Number(grp.pilot.id)   : null,
490      copilot:      grp.copilot?.id ? Number(grp.copilot.id) : null,
491      drone_id:     Number(grp.drone_id),
492      working_date: grp.dates,
493    });
494    const send = () => fetch(ASSIGN_URL(bookingId), {
495      method: "POST",
496      headers: { "Content-Type": "application/json", [IDEMPOTENCY_HEADER]: keys.keyFor(body) },
497      body,
498    });
499    let res = await send();
500    for (let waits = 0; waits < 6; waits++) {
501      if (res.status !== 409) break;
502      const e = await res.clone().json().catch(() => ({}));
503      if (!isStillProcessing(res.status, e)) break;
504      await new Promise((r) => setTimeout(r, retryAfterSeconds(res.headers.get("Retry-After")) * 1000));
505      res = await send();
506    }
507    if (!res.ok) {
508      const e = await res.json().catch(() => ({}));
509      throw new Error(e.message || `Server error ${res.status}`);
510    }
511  }
512  
513  function AssignModal({ order, onClose, onSuccess }) {
514    const assignKeys = useRef(createIdempotencyKeys());   // see postAssignment
```

### `DarhubAdmin/src/pages/Orders.jsx` (lines 590-608)

```jsx
590    async function handleSubmit() {
591      setSubmitting(true);
592      setSubmitErr(null);
593      try {
594        const groups = groupByDrone(selDates, dateAssign);
595        for (const grp of groups) {
596          await postAssignment(order.booking_id, grp, assignKeys.current);
597        }
598        assignKeys.current.clear();
599        setStep("success");
600        onSuccess?.();
601      } catch (err) {
602        setSubmitErr(err.message);
603      } finally {
604        setSubmitting(false);
605      }
606    }
607  
608    const unassigned  = selDates.filter(d => !dateAssign[d]).length;
```

## B5. Tests

### `DarhubBackend/tests/idempotency.test.js` (whole file)

```js
  1  import test from 'node:test';
  2  import assert from 'node:assert/strict';
  3  import express from 'express';
  4  import { idempotent, stableStringify } from '../middleware/idempotency.js';
  5  import { MemoryIdempotencyStore } from '../services/idempotency.service.js';
  6  
  7  const KEY = '3f1c2b7e-9a51-4c7e-8d0b-5a6f1e2d3c4b';
  8  
  9  /** A tiny app: POST /orders creates an "order" (counted), with a fake signed-in user from the x-user header. */
 10  const makeApp = ({ store = new MemoryIdempotencyStore(), required = false, handler } = {}) => {
 11    const state = { created: 0, store };
 12    const app = express();
 13    app.use(express.json());
 14    app.use((req, res, next) => { req.auth = { id: Number(req.get('x-user') || 1) }; next(); });
 15    app.post('/orders', idempotent({ store, required }), handler ?? (async (req, res) => {
 16      state.created += 1;
 17      res.status(201).json({ booking_id: `b-${state.created}`, acres: req.body.acres });
 18    }));
 19    return { app, state };
 20  };
 21  
 22  const withServer = async (app, fn) => {
 23    const server = app.listen(0);
 24    await new Promise((r) => server.once('listening', r));
 25    const base = `http://127.0.0.1:${server.address().port}`;
 26    try {
 27      return await fn((body, headers = {}) => fetch(`${base}/orders`, {
 28        method: 'POST',
 29        headers: { 'Content-Type': 'application/json', ...headers },
 30        body: JSON.stringify(body),
 31      }).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json() })));
 32    } finally {
 33      server.close();
 34    }
 35  };
 36  
 37  test('idempotency: a retry with the same key replays the first response and creates nothing new', async () => {
 38    const { app, state } = makeApp();
 39    await withServer(app, async (post) => {
 40      const first = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
 41      const again = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
 42      assert.equal(first.status, 201);
 43      assert.equal(again.status, 201);
 44      assert.deepEqual(again.body, first.body);
 45      assert.equal(again.headers.get('idempotent-replayed'), 'true');
 46      assert.equal(first.headers.get('idempotent-replayed'), null);
 47      assert.equal(state.created, 1);
 48    });
 49  });
 50  
 51  test('idempotency: 10 simultaneous copies create exactly one order; the others replay it or are told to wait', async () => {
 52    let release;
 53    const gate = new Promise((r) => { release = r; });
 54    const { app, state } = makeApp({
 55      handler: async (req, res) => {
 56        state.created += 1;
 57        await gate;                                   // keep the first request "running" while the copies arrive
 58        res.status(201).json({ booking_id: 'only-one' });
 59      },
 60    });
 61    await withServer(app, async (post) => {
 62      const copies = Array.from({ length: 10 }, () => post({ acres: 3 }, { 'Idempotency-Key': KEY }));
 63      await new Promise((r) => setTimeout(r, 100));
 64      release();
 65      const results = await Promise.all(copies);
 66      assert.equal(state.created, 1);
 67      assert.equal(results.filter((r) => r.status === 201).length, 1);
 68      const waiting = results.filter((r) => r.status === 409);
 69      assert.equal(waiting.length, 9);
 70      assert.equal(waiting[0].body.code, 'IDEMPOTENCY_REQUEST_IN_PROGRESS');
 71      assert.ok(Number(waiting[0].headers.get('retry-after')) >= 1);
 72      const replay = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
 73      assert.equal(replay.body.booking_id, 'only-one');
 74    });
 75  });
 76  
 77  test('idempotency: the same key with a different body is refused (422), not silently replayed', async () => {
 78    const { app, state } = makeApp();
 79    await withServer(app, async (post) => {
 80      await post({ acres: 3 }, { 'Idempotency-Key': KEY });
 81      const other = await post({ acres: 30 }, { 'Idempotency-Key': KEY });
 82      assert.equal(other.status, 422);
 83      assert.equal(other.body.code, 'IDEMPOTENCY_KEY_REUSED');
 84      assert.equal(state.created, 1);
 85    });
 86  });
 87  
 88  test('idempotency: body key order does not matter; keys are per user', async () => {
 89    const { app, state } = makeApp();
 90    await withServer(app, async (post) => {
 91      await post({ acres: 3, crop: 1 }, { 'Idempotency-Key': KEY });
 92      const reordered = await post({ crop: 1, acres: 3 }, { 'Idempotency-Key': KEY });
 93      assert.equal(reordered.headers.get('idempotent-replayed'), 'true');
 94      const otherUser = await post({ acres: 3, crop: 1 }, { 'Idempotency-Key': KEY, 'x-user': '2' });
 95      assert.equal(otherUser.status, 201);
 96      assert.equal(otherUser.headers.get('idempotent-replayed'), null);
 97      assert.equal(state.created, 2);
 98    });
 99    assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: 1 }] }), stableStringify({ a: [{ c: 1, d: 2 }], b: 1 }));
100  });
101  
102  test('idempotency: 5xx and retryable 409 are not stored, so a retry with the same key runs again', async () => {
103    let calls = 0;
104    const { app } = makeApp({
105      handler: (req, res) => {
106        calls += 1;
107        if (calls === 1) return res.status(503).json({ error: 'database down' });
108        if (calls === 2) return res.status(409).json({ error: 'drone busy' });
109        return res.status(201).json({ booking_id: 'third-time' });
110      },
111    });
112    await withServer(app, async (post) => {
113      assert.equal((await post({ acres: 3 }, { 'Idempotency-Key': KEY })).status, 503);
114      assert.equal((await post({ acres: 3 }, { 'Idempotency-Key': KEY })).status, 409);
115      const ok = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
116      assert.equal(ok.status, 201);
117      assert.equal(ok.body.booking_id, 'third-time');
118    });
119  });
120  
121  test('idempotency: a final 400 is stored and replayed for the identical request', async () => {
122    let calls = 0;
123    const { app } = makeApp({ handler: (req, res) => { calls += 1; res.status(400).json({ error: 'date in the past' }); } });
124    await withServer(app, async (post) => {
125      await post({ acres: 3 }, { 'Idempotency-Key': KEY });
126      const again = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
127      assert.equal(again.status, 400);
128      assert.equal(again.headers.get('idempotent-replayed'), 'true');
129      assert.equal(calls, 1);
130    });
131  });
132  
133  test('idempotency: a handler that crashed releases the key; a request stuck past its lock can be taken over', async () => {
134    let now = 1_000_000;
135    const store = new MemoryIdempotencyStore({ now: () => now });
136    const first = await store.claim({ userId: 1, scope: 's', key: KEY, requestHash: 'h', lockSeconds: 60, ttlSeconds: 86400 });
137    assert.equal(first.outcome, 'new');
138    assert.equal((await store.claim({ userId: 1, scope: 's', key: KEY, requestHash: 'h', lockSeconds: 60, ttlSeconds: 86400 })).outcome, 'in_progress');
139    now += 61_000;                                   // the first attempt died without answering
140    assert.equal((await store.claim({ userId: 1, scope: 's', key: KEY, requestHash: 'h', lockSeconds: 60, ttlSeconds: 86400 })).outcome, 'new');
141    now += 86_400_000;                               // and after the TTL the key is free again
142    assert.equal(await store.purgeExpired(), 1);
143  
144    const { app, state } = makeApp({
145      store,
146      handler: (req, res) => { state.created += 1; res.destroy(); },  // connection dropped, no response
147    });
148    await withServer(app, async (post) => {
149      await post({ acres: 3 }, { 'Idempotency-Key': 'crash-key-1' }).catch(() => {});
150      await new Promise((r) => setTimeout(r, 50));
151      await post({ acres: 3 }, { 'Idempotency-Key': 'crash-key-1' }).catch(() => {});
152      assert.equal(state.created, 2, 'the retry ran instead of waiting 60 s for the lock');
153    });
154  });
155  
156  test('idempotency: invalid keys are refused; a missing key is allowed unless required', async () => {
157    const { app, state } = makeApp();
158    await withServer(app, async (post) => {
159      const bad = await post({ acres: 3 }, { 'Idempotency-Key': 'short' });
160      assert.equal(bad.status, 400);
161      assert.equal(bad.body.code, 'INVALID_IDEMPOTENCY_KEY');
162      assert.equal((await post({ acres: 3 }, { 'Idempotency-Key': 'has spaces in it' })).status, 400);
163      assert.equal((await post({ acres: 3 })).status, 201);
164      assert.equal(state.created, 1);
165    });
166    const strict = makeApp({ required: true });
167    await withServer(strict.app, async (post) => {
168      const missing = await post({ acres: 3 });
169      assert.equal(missing.status, 400);
170      assert.equal(missing.body.code, 'IDEMPOTENCY_KEY_REQUIRED');
171    });
172  });
173  
174  test('idempotency: a key store failure refuses the request instead of risking a duplicate', async () => {
175    const broken = { claim: async () => { const e = new Error('connect ECONNREFUSED'); e.name = 'SequelizeConnectionRefusedError'; throw e; } };
176    const { app, state } = makeApp({ store: broken });
177    await withServer(app, async (post) => {
178      const r = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
179      assert.equal(r.status, 503);
180      assert.equal(state.created, 0);
181    });
182  });
```

### `DarhubBackend/tests/e2e/concurrency.mjs` (lines 31-48)

Against the real server and Postgres. `call(method, path, body, token, form, extraHeaders)` returns `{ s: status, j: json, h: headers }`; `db(sql)` runs a query; `t(name, ok, detail)` records a check.

```js
31  // 2. duplicate create-order burst
32  const before=db(`select count(*) from "SPRAYING_ORDER" where user_id=${F1.id}`);
33  const order={start_date:today,crop_type_id:crop,land_in_acers:3,user_id:F1.id,address:{state:'34',district:'103',block:'57',lane1:'x',village:'t',pincode:'833201'}};
34  const key={'Idempotency-Key':'cc-'+R+'-create'};
35  const burst=await Promise.all(Array.from({length:5},()=>call('POST','/order/create-order',order,F1.tok,false,key)));
36  const afterBurst=db(`select count(*) from "SPRAYING_ORDER" where user_id=${F1.id}`);
37  await new Promise(r=>setTimeout(r,300));
38  const retry=await call('POST','/order/create-order',order,F1.tok,false,key);
39  const created=burst.find(r=>r.s===201);
40  t('5 simultaneous create-order with one Idempotency-Key: exactly 1 order',afterBurst-before===1&&burst.every(r=>[201,409].includes(r.s)),`statuses=${burst.map(r=>r.s)} new orders=${afterBurst-before}`);
41  t('Retry with the same key replays the same booking_id, no new order',retry.s===201&&retry.h.get('idempotent-replayed')==='true'&&retry.j.booking_id===created?.j.booking_id&&db(`select count(*) from "SPRAYING_ORDER" where user_id=${F1.id}`)==afterBurst,`replayed=${retry.h.get('idempotent-replayed')} same id=${retry.j.booking_id===created?.j.booking_id}`);
42  const reuse=await call('POST','/order/create-order',{...order,land_in_acers:4},F1.tok,false,key);
43  t('Same key with a different body -> 422 IDEMPOTENCY_KEY_REUSED',reuse.s===422&&reuse.j.code==='IDEMPOTENCY_KEY_REUSED',`status=${reuse.s} code=${reuse.j.code}`);
44  const stored=db(`select status||'/'||response_status from "IDEMPOTENCY_KEY" where idem_key='cc-${R}-create'`);
45  t('Key row stored as completed/201 (saved in the order transaction)',stored==='completed/201',stored);
46  const noKey=await Promise.all(Array.from({length:2},()=>call('POST','/order/create-order',order,F1.tok)));
47  t('Without a key requests still work (old app versions)',noKey.every(r=>r.s===201),`statuses=${noKey.map(r=>r.s)}`);
48  db(`update "SPRAYING_ORDER" set order_status='ORDER_CANCELLED' where booking_id in ('${created?.j.booking_id}','${noKey.map(r=>r.j.booking_id).join("','")}')`);
```

### Observed test results (local Docker Postgres 14, 2026-10-21)

- `node --test tests/idempotency.test.js`: 9/9 pass.
- `tests/e2e/concurrency.mjs`: 5 simultaneous same-key create-order → statuses `409,201,409,409,409`, exactly 1 new order; retry replayed the same `booking_id`; reuse with another body → 422; key row `completed/201`; 2 requests without a key → 2 orders.
- Manual checks against Postgres:
  - row forced to `processing` with a lock still held → 409;
  - lock expired → retry took over and created an order (the test reset the key row without deleting the order, so this simulated "crashed before commit");
  - completed → replay;
  - `expires_at` in the past → new request accepted, 1 row;
  - assign-work with the same key twice → second replayed, 1 daily-log row;
  - farmer cancel replayed, other reason with the same key → 422, 1 cancellation timeline row.
- Farmer app `IdempotencyKeysTest`: 5/5 pass.
