import { createHash } from 'crypto';
import logger from '../utils/logger.js';
import { respondWithError } from './errorHandler.js';
import { getDefaultIdempotencyStore } from '../services/idempotency.service.js';

/**
 * Idempotency-Key support for requests that create or change something (IETF draft "The Idempotency-Key HTTP
 * Header Field", same rules as Stripe). A client that may send a request twice (double tap, timeout and retry,
 * OkHttp's silent retry on a dropped connection) sends the same random key with every copy:
 *
 *   first request             runs normally; its response is stored for `ttlSeconds` (24 h)
 *   same key, same request    the stored response is sent again (header Idempotent-Replayed: true), nothing runs
 *   same key while running    409 IDEMPOTENCY_REQUEST_IN_PROGRESS with Retry-After
 *   same key, other request   422 IDEMPOTENCY_KEY_REUSED (a key belongs to exactly one request body)
 *
 * Keys are scoped to the signed-in user and the endpoint, so this must run AFTER authentication.
 * Final answers (2xx and 4xx) are stored. 5xx and the retryable 4xx below are not: the attempt is forgotten and
 * the client can retry with the same key.
 * A handler that creates data should call `req.idempotency.complete(status, body, { transaction })` inside its
 * transaction: the stored response then commits (or rolls back) together with the data, so a crash between the
 * commit and the reply can never let a retry create a second copy.
 */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,255}$/;
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429]);

/** JSON with object keys sorted, so {a,b} and {b,a} hash the same. */
export const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

export const hashRequest = (req) => createHash('sha256')
  .update(`${req.method} ${req.originalUrl}\n${stableStringify(req.body ?? {})}`)
  .digest('hex');

const fail = (req, res, status, code, message, headers = {}) => {
  res.set(headers);
  return res.status(status).json({
    success: false,
    message,
    error: message,
    code,
    ...(req.id && { request_id: req.id }),
  });
};

/**
 * @param {object}  [options]
 * @param {boolean} [options.required=false]  refuse requests without a key (turn on once every client sends one)
 * @param {number}  [options.lockSeconds=60]  after this long a still-running attempt counts as crashed
 * @param {number}  [options.ttlSeconds=86400] how long a key and its response are kept
 * @param {object}  [options.store]           defaults to the database store
 */
export const idempotent = ({ required = false, lockSeconds = 60, ttlSeconds = 24 * 60 * 60, store } = {}) =>
  async (req, res, next) => {
    const key = req.get(IDEMPOTENCY_HEADER);
    if (key === undefined || key === '') {
      if (!required) return next();
      return fail(req, res, 400, 'IDEMPOTENCY_KEY_REQUIRED', `The ${IDEMPOTENCY_HEADER} header is required for this request.`);
    }
    if (!KEY_PATTERN.test(key)) {
      return fail(req, res, 400, 'INVALID_IDEMPOTENCY_KEY',
        `${IDEMPOTENCY_HEADER} must be 8-255 characters of letters, digits, "-", "_", "." or ":" (a UUID is recommended).`);
    }
    const userId = req.auth?.id ?? req.admin?.id ?? req.user?.id;
    if (!userId) return next();   // only reachable if the route has no authentication in front

    const scope = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`.slice(0, 120);
    let claim;
    let activeStore;
    try {
      activeStore = store ?? await getDefaultIdempotencyStore();
      claim = await activeStore.claim({ userId, scope, key, requestHash: hashRequest(req), lockSeconds, ttlSeconds });
    } catch (err) {
      // Without the key store we cannot promise "at most once": refuse rather than risk a duplicate
      return respondWithError(req, res, err, 'idempotency');
    }

    res.set(IDEMPOTENCY_HEADER, key);
    if (claim.outcome === 'mismatch') {
      return fail(req, res, 422, 'IDEMPOTENCY_KEY_REUSED',
        `This ${IDEMPOTENCY_HEADER} was already used for a different request. Use a new key for a new request.`);
    }
    if (claim.outcome === 'in_progress') {
      return fail(req, res, 409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        'The same request is still being processed. Please wait a moment.', { 'Retry-After': String(claim.retryAfter) });
    }
    if (claim.outcome === 'replay') {
      res.set('Idempotent-Replayed', 'true');
      return res.status(claim.status).json(claim.body);
    }

    // outcome === 'new': run the handler and keep its answer
    let savedByHandler = false;
    let settled = false;
    req.idempotency = {
      key,
      complete: async (status, body, { transaction } = {}) => {
        await activeStore.complete(claim.id, status, body, { transaction });
        // Saved inside a transaction: it only counts once that transaction commits (a rollback undoes it)
        if (transaction?.afterCommit) transaction.afterCommit(() => { savedByHandler = true; });
        else savedByHandler = true;
      },
    };

    const send = res.json.bind(res);
    res.json = (body) => {
      if (settled) return send(body);
      settled = true;
      const status = res.statusCode;
      const keep = status < 500 && !RETRYABLE_STATUSES.has(status);
      const save = savedByHandler
        ? Promise.resolve()
        : keep ? activeStore.complete(claim.id, status, body) : activeStore.release(claim.id);
      save
        .catch((err) => logger.error(`idempotency: could not ${keep ? 'store' : 'release'} key for ${scope}: ${err.message}`, { request_id: req.id }))
        .finally(() => send(body));
      return res;
    };
    // A handler that crashed or answered without res.json must not leave the key stuck until the lock expires
    res.on('close', () => {
      if (settled || savedByHandler) return;
      settled = true;
      activeStore.release(claim.id).catch((err) => logger.error(`idempotency: could not release key for ${scope}: ${err.message}`));
    });
    return next();
  };
