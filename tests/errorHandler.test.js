import test from 'node:test';
import assert from 'node:assert/strict';
import { respondWithError, notFoundHandler } from '../middleware/errorHandler.js';
import { ApiError } from '../utils/apiError.js';

const run = (err, { production = false } = {}) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = production ? 'production' : 'development';
  const out = { headers: {} };
  const req = { method: 'POST', originalUrl: '/api/x', id: 'req-1' };
  const res = {
    headersSent: false,
    set(k, v) { out.headers[k] = v; return this; },
    status(code) { out.status = code; return this; },
    json(body) { out.body = body; return this; },
  };
  respondWithError(req, res, err);
  process.env.NODE_ENV = previous;
  return out;
};

test('ApiError keeps its status and message', () => {
  const { status, body } = run(new ApiError(409, 'Already there'));
  assert.equal(status, 409);
  assert.equal(body.message, 'Already there');
  assert.equal(body.error, 'Already there');
  assert.equal(body.request_id, 'req-1');
  assert.equal(body.success, false);
});

test('unknown errors never leak their message in production', () => {
  const { status, body } = run(new Error('relation "USER" does not exist'), { production: true });
  assert.equal(status, 500);
  assert.ok(!body.message.includes('relation'));
});

test('database outage is a retryable 503, not a 500', () => {
  const err = Object.assign(new Error('connect ECONNREFUSED'), { name: 'SequelizeConnectionRefusedError' });
  const { status, body, headers } = run(err);
  assert.equal(status, 503);
  assert.equal(body.code, 'DATABASE_UNAVAILABLE');
  assert.equal(headers['Retry-After'], '5');
});

test('upload errors map to client errors', () => {
  const big = Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
  assert.equal(run(big).status, 413);
});

test('malformed JSON is a 400', () => {
  const err = Object.assign(new SyntaxError('Unexpected token'), { status: 400, statusCode: 400, type: 'entity.parse.failed' });
  const { status, body } = run(err);
  assert.equal(status, 400);
  assert.equal(body.code, 'MALFORMED_JSON');
});

test('unknown route answers in JSON', () => {
  const out = {};
  notFoundHandler({ method: 'GET', originalUrl: '/nope' }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; } });
  assert.equal(out.status, 404);
  assert.equal(out.body.code, 'ROUTE_NOT_FOUND');
});

import { hideServerErrorDetails } from '../middleware/errorHandler.js';

const runHide = (statusCode, body, { production }) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = production ? 'production' : 'development';
  let sent;
  const res = { statusCode, json(b) { sent = b; return this; } };
  hideServerErrorDetails({ method: 'GET', originalUrl: '/x', id: 'r1' }, res, () => {});
  res.json(body);
  process.env.NODE_ENV = previous;
  return sent;
};

test('in production a 500 body from a legacy handler is replaced, nothing internal reaches the client', () => {
  const sent = runHide(500, { error: 'relation "SPRAYING_ORDER" does not exist at /srv/app/x.js' }, { production: true });
  assert.ok(!JSON.stringify(sent).includes('SPRAYING_ORDER'));
  assert.equal(sent.code, 'INTERNAL_ERROR');
  assert.equal(sent.request_id, 'r1');
});

test('client errors, and non-production runs, are untouched', () => {
  assert.deepEqual(runHide(400, { error: 'Invalid email' }, { production: true }), { error: 'Invalid email' });
  assert.deepEqual(runHide(500, { error: 'boom' }, { production: false }), { error: 'boom' });
});
