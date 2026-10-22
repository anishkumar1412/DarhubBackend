# Idempotency-Key: how it works in Darhub

A booking request can reach the server more than once even when the user booked once:

- the farmer double-taps **Confirm**;
- the phone times out (Render's cold start can take 30-60 s) and the farmer taps again;
- OkHttp silently resends a POST when a connection drops;
- an admin presses **Confirm** again after one drone group of an assignment failed.

Before this change, every copy created a new order: 5 identical `create-order` calls made 5 bookings.
Now the client sends an `Idempotency-Key` header. The server runs a request with a given key **at most once** and answers every repeat with the first result.

The design follows the IETF draft *"The Idempotency-Key HTTP Header Field"* and Stripe's implementation.

---

## 1. The contract (what clients see)

```
POST /order/create-order
Authorization: Bearer <token>
Idempotency-Key: 3f1c2b7e-9a51-4c7e-8d0b-5a6f1e2d3c4b
```

| Situation | Response |
|---|---|
| First request with this key | Runs normally (e.g. `201`). The response is stored for 24 h. |
| Same key, same body | The stored response again, with header `Idempotent-Replayed: true`. **Nothing runs.** |
| Same key while the first copy is still running | `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` + `Retry-After: <seconds>` |
| Same key, **different** body or URL | `422 IDEMPOTENCY_KEY_REUSED` (one key = one request) |
| Malformed key | `400 INVALID_IDEMPOTENCY_KEY` (must be 8-255 chars of `A-Z a-z 0-9 - _ . :`, a UUID is recommended) |
| No key | Runs normally, without protection (old app versions keep working). `400 IDEMPOTENCY_KEY_REQUIRED` only when `IDEMPOTENCY_KEY_REQUIRED=true`. |
| Key store unreachable | `503` (fail closed: we refuse rather than risk a duplicate) |

Keys are **scoped per user and per endpoint**. Two farmers can use the same UUID without colliding, and the same key on `create-order` and on `cancel` are two different records.

### Which responses are stored

| Status | Stored? | Why |
|---|---|---|
| `2xx` | Yes | The work is done; a repeat must get the same booking back. |
| `4xx` (400, 403, 404, 422...) | Yes | The same input gives the same answer, so a replay is correct. A client that fixes the input sends a new body, so it needs a new key anyway. |
| `408, 409, 425, 429` | **No** (released) | Retryable: "drone busy" or "rate limited" may succeed later with the same key. |
| `5xx`, crash, dropped connection | **No** (released) | The request may not have happened; the client must be able to retry with the same key. |

---

## 2. Where it is applied

| Endpoint | Who | File |
|---|---|---|
| `POST /order/create-order` | farmer, admin | [routes/orderRoutes.js:49](../routes/orderRoutes.js#L49) (`onceOnly`, honours `IDEMPOTENCY_KEY_REQUIRED`) |
| `POST /order/assign-work/:booking_id` | admin | [routes/orderRoutes.js:72](../routes/orderRoutes.js#L72) |
| `POST /api/farmer/bookings/:id/cancel` | farmer | [routes/farmerRoutes.js:147](../routes/farmerRoutes.js#L147) |
| `PATCH /api/farmer/bookings/:id/reschedule` | farmer | [routes/farmerRoutes.js:154](../routes/farmerRoutes.js#L154) |

The middleware always comes **after authentication**, because it needs the user id for the scope. On the farmer routes it also comes after `validate()`, so it hashes the normalised body.

---

## 3. Components

```
 client ──► auth ──► idempotent() middleware ──► controller ──► DB transaction
                         │        ▲                    │
                         │        │ replay             │ req.idempotency.complete(201, body, { transaction: t })
                         ▼        │                    ▼
                     IdempotencyStore  ◄────────── same transaction as the order
                     (table IDEMPOTENCY_KEY)
```

| Piece | File | Role |
|---|---|---|
| Middleware | [middleware/idempotency.js](../middleware/idempotency.js) | Reads and validates the header, hashes the request, asks the store, replays or runs the handler, stores or releases the result |
| Store (Postgres) | [services/idempotency.service.js](../services/idempotency.service.js) `SqlIdempotencyStore` | Atomic claim / complete / release / purge with raw SQL |
| Store (memory) | same file, `MemoryIdempotencyStore` | Same rules, for unit tests |
| Model | [models/IdempotencyKey.js](../models/IdempotencyKey.js) | Table `IDEMPOTENCY_KEY` (created by `sequelize.sync` on boot) |
| Migration | [migrations/004_idempotency_keys.sql](../migrations/004_idempotency_keys.sql) | Same table for hand-managed schemas |
| Cleanup | [cron/jobs.js:72](../cron/jobs.js#L72) | Nightly (02:30 IST) delete of expired keys |
| Config | [config/env.js](../config/env.js) | `IDEMPOTENCY_KEY_REQUIRED` (default `false`) |
| CORS | [app.js:106](../app.js#L106) | Exposes `Idempotency-Key`, `Idempotent-Replayed`, `Retry-After` so the browser admin can read them |

### Why Postgres and not Redis

Redis is optional in this project: it only holds OTP rate limits and falls back to memory. Idempotency must survive restarts and be shared by every server instance. Also, for create-order the key record has to commit **in the same transaction as the order** (section 6). Only the main database can do that.

---

## 4. The table

```sql
CREATE TABLE "IDEMPOTENCY_KEY" (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER      NOT NULL,          -- who sent it
  scope            VARCHAR(120) NOT NULL,          -- "POST /order/create-order"
  idem_key         VARCHAR(255) NOT NULL,          -- the header value
  request_hash     VARCHAR(64)  NOT NULL,          -- sha256 of method + URL + body
  status           VARCHAR(20)  NOT NULL DEFAULT 'processing',   -- processing | completed
  response_status  INTEGER,                        -- e.g. 201
  response_body    JSONB,                          -- the exact JSON sent the first time
  locked_until     TIMESTAMPTZ,                    -- "processing" past this time = the attempt crashed
  expires_at       TIMESTAMPTZ  NOT NULL,          -- created + 24 h
  created_on       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  modified_on      TIMESTAMPTZ
);
CREATE UNIQUE INDEX idempotency_key_user_scope_key_uq ON "IDEMPOTENCY_KEY" (user_id, scope, idem_key);
CREATE INDEX        idempotency_key_expires_at_idx    ON "IDEMPOTENCY_KEY" (expires_at);
```

The **unique index** is what makes concurrent duplicates impossible: only one `INSERT` can win.
All times come from the database clock (`now()`), so server instances with skewed clocks agree.

---

## 5. Request flow, step by step

### 5.1 Middleware ([middleware/idempotency.js:57](../middleware/idempotency.js#L57))

1. **Read the header.** If it is missing, call `next()` (or answer `400` if `required`). If it is malformed, answer `400`.
2. **Identify the request.**
   - `userId` = `req.auth.id` (or `req.admin.id` / `req.user.id`)
   - `scope` = `"<METHOD> <baseUrl><route path>"`, e.g. `POST /api/farmer/bookings/:booking_id/cancel`
   - `requestHash` = `sha256("<METHOD> <originalUrl>\n" + stableStringify(body))`.
     [`stableStringify`](../middleware/idempotency.js#L28) sorts object keys, so `{a,b}` and `{b,a}` hash the same. The URL is part of the hash, so a key reused on another booking id is a mismatch.
3. **Claim** the key in the store (section 5.2) and act on the outcome:
   - `mismatch` → `422`
   - `in_progress` → `409` + `Retry-After`
   - `replay` → stored status and body, `Idempotent-Replayed: true`
   - `new` → continue
4. **Run the handler**, with:
   - `req.idempotency.complete(status, body, { transaction })` available to the handler;
   - `res.json` wrapped: when the handler answers, the wrapper **stores** the response (final statuses) or **releases** the key (5xx / retryable), and only then sends it;
   - a `res.on('close')` hook that releases the key if the handler crashed or the connection closed without a JSON answer, so the client does not wait 60 s for the lock to expire.

### 5.2 Store: `claim()` ([services/idempotency.service.js:20](../services/idempotency.service.js#L20))

```sql
-- 1. try to become the owner
INSERT INTO "IDEMPOTENCY_KEY" (user_id, scope, idem_key, request_hash, status, locked_until, expires_at, created_on)
VALUES (:userId, :scope, :key, :hash, 'processing', now() + 60 s, now() + 24 h, now())
ON CONFLICT (user_id, scope, idem_key) DO NOTHING
RETURNING id;
```

- **A row came back:** this request owns the key → `new`.
- **No row** (someone already has the key): read it and decide.

```
expired?               → delete it, try the INSERT again (once)
request_hash differs?  → mismatch
status = completed?    → replay (response_status, response_body)
lock expired?          → takeover (below)
otherwise              → in_progress (retryAfter = seconds left on the lock)
```

**Takeover.** If a request died while `processing` (crash, deploy, killed process), its row would block the key forever. When `locked_until` has passed, exactly one retry may take the row over:

```sql
UPDATE "IDEMPOTENCY_KEY" SET locked_until = now() + 60 s, modified_on = now()
 WHERE id = :id AND status = 'processing' AND locked_until < now()
RETURNING id;
```

The `WHERE` makes it a compare-and-set: if two retries race, only one gets a row back. The other gets `in_progress`.

### 5.3 Store: `complete()` and `release()`

```sql
-- complete: only a row still being processed can be completed (no double write)
UPDATE "IDEMPOTENCY_KEY"
   SET status = 'completed', response_status = :status, response_body = :body::jsonb, locked_until = NULL
 WHERE id = :id AND status = 'processing';

-- release: forget a failed attempt so the same key can be retried
DELETE FROM "IDEMPOTENCY_KEY" WHERE id = :id AND status = 'processing';
```

---

## 6. The important part: create-order is atomic

If the middleware stored the response only **after** the handler committed the order, there would be a window:

```
order committed ──► server crashes ──► key still 'processing' ──► lock expires ──► retry takes over ──► SECOND ORDER
```

To close it, `createOrder` builds its response body **before** the transaction. It then stores it **inside** the same transaction that inserts the order, the timeline row and the address ([controllers/Admin.controller.js:1359](../controllers/Admin.controller.js#L1359)):

```js
await db.sequelize.transaction(async (t) => {
  await SprayingOrder.create({ ... }, { transaction: t });
  await db.SprayingOrderTimeline.create({ ... }, { transaction: t });
  await SprayingOrderAddress.create({ ... }, { transaction: t });
  await req.idempotency?.complete(201, responseBody, { transaction: t });   // ← same transaction
});
return res.status(201).json(responseBody);
```

So either **both** the order and the "completed" key commit, or **neither** does:

| Crash point | State after | What a retry does |
|---|---|---|
| Before commit | No order, key `processing` | Waits out the lock (or gets it released), then creates the order once |
| After commit, before the reply | Order exists, key `completed` with the response | Replays the booking. No duplicate. |

The middleware treats a handler-stored response as final only after the commit (`transaction.afterCommit`, [line 104](../middleware/idempotency.js#L104)). If the transaction rolls back, for example on a `400` thrown inside it, the middleware stores or releases the key normally.

`assign-work`, `cancel` and `reschedule` use the simpler path: the response is stored right after the handler answers. That is enough there, because those handlers are already guarded by status checks and row locks: a second cancel finds the booking already cancelled. The key just turns an error into a clean replay.

---

## 7. Clients

### Farmer app (Kotlin)

| File | What |
|---|---|
| [`IdempotencyKeys.kt`](../../Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/data/network/IdempotencyKeys.kt) | `IdempotencyKeyHolder`: **same key while the request is unchanged**, new key when it changes, `clear()` after success. `stableIdempotencyKey(...)`: deterministic UUID (v3) for one-off actions. |
| [`BookingViewModel.kt`](../../Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/ui/home/booking/BookingViewModel.kt) | `createOrder()`: ignores a tap while a request is in flight; keeps the key on network errors (tapping again is a safe retry); on `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` waits `Retry-After` (1-5 s) and resends, up to 6 times; clears the key on success. |
| [`OrderRepository.kt`](../../Darhub-Farmer-App/app/src/main/java/com/darhub/darhubfarmer/data/repository/OrderRepository.kt) | Cancel uses `stableIdempotencyKey("cancel", bookingId, reason)`: a booking is cancelled once, so the same cancel always has the same key. |
| `ApiService.kt` | `@Header("Idempotency-Key")` on `createOrder` and `cancelFarmerBooking` |

"Same request" uses Kotlin `data class` equality: `BookStep3Fragment` builds a new `CreateOrderRequest` on every tap, and equal content means the same key.

### Admin panel (React)

| File | What |
|---|---|
| [`src/api/idempotency.js`](../../DarhubAdmin/src/api/idempotency.js) | `createIdempotencyKeys()`: a map from request body to key; `newIdempotencyKey()` (with a fallback when `crypto.randomUUID` is unavailable outside https); `isStillProcessing()`, `retryAfterSeconds()` |
| [`CreateOrder/Step4.jsx`](../../DarhubAdmin/src/components/CreateOrder/Step4.jsx) | Create order: the key is kept in a `useRef`, with wait-and-resend on in-progress and `clear()` on success |
| [`pages/Orders.jsx`](../../DarhubAdmin/src/pages/Orders.jsx) `postAssignment()` | Assign Work and Edit Schedule send one POST per drone group, **one key per group**. If group 2 fails, pressing Confirm again replays group 1 instead of failing it with "already booked", and retries only group 2. Keys are cleared when every group succeeded. |

---

## 8. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `IDEMPOTENCY_KEY_REQUIRED` | `false` | When `true`, `create-order` without the header is refused (`400`). Turn it on only after every app version in use sends keys. |

Fixed in code (options of `idempotent()`): `lockSeconds = 60`, `ttlSeconds = 86400`.

---

## 9. Tests

| Test | What it proves |
|---|---|
| [tests/idempotency.test.js](../tests/idempotency.test.js) (9 tests, memory store, real Express) | replay; **10 simultaneous copies → 1 execution** (others get 409); 422 on body change; key order irrelevant; per-user scope; 5xx and 409 released; final 400 replayed; crash release and lock takeover; TTL purge; invalid/missing/required key; store outage → 503 |
| [tests/e2e/concurrency.mjs](../tests/e2e/concurrency.mjs) (real Postgres) | 5 simultaneous same-key `create-order` → **exactly 1 order**; retry replays the same `booking_id`; 422 on reuse; the key row is `completed/201` (written in the order transaction); no key still works |
| Farmer `IdempotencyKeysTest.kt` (5 tests) | same request → same key; changed request → new key; new key after `clear()`; key format accepted by the server; deterministic cancel keys |
| Manual, against the test DB | lock held → 409; lock expired → takeover; completed → replay; expired → new; assign-work and cancel replay; 422 on a different cancel reason |

Run: `npm test` (unit) and `npm run test:e2e` (isolated Docker Postgres harness).

---

## 10. Known limits and possible next steps

1. **A handler running longer than the 60 s lock.** If a request is still running (not crashed) after 60 s, a retry can take the key over and run the handler a second time. For `create-order` the second attempt's `complete()` updates 0 rows, but its order would still commit. Today `create-order` takes milliseconds, so this needs a stalled database to happen. The fix would be a **fencing token**: store a claim version, check it in `complete()`, and roll the transaction back when it no longer matches. Alternatively, raise `lockSeconds`.
2. **Process death on Android.** The Farmer app keeps the key in the `ViewModel`, so it is lost if Android kills the app between the tap and the retry. Storing it in a `SavedStateHandle` would close that gap.
3. **Old app versions** send no key and are unprotected until `IDEMPOTENCY_KEY_REQUIRED=true`.
4. **Bodies are hashed exactly as sent** on `create-order` (before validation): `"land_in_acers": "3"` and `3` are different requests. Clients send the same serialisation on retry, so this does not matter in practice.
5. **Storage growth:** one row per protected request for 24 h, purged nightly; indexed on `expires_at`.
