# Redis (OTP resend cooldowns, send limits and blocks)

The backend uses Redis only for short-lived counters that protect the OTP endpoints: the resend countdown,
"5 codes per IP / per phone or email in 15 minutes", and the temporary block after repeated wrong codes.
The codes themselves are stored (hashed) in PostgreSQL. Nothing in Redis needs a backup: every key expires
within the configured window.

The connection is set by one variable: `REDIS_URL`. Keys are namespaced by `REDIS_KEY_PREFIX`
(default `darhub:<NODE_ENV>:`), so development, staging and production can share one Redis safely.

## Local development (Ubuntu, no Docker)
```bash
sudo apt install redis-server            # Ubuntu 24.04 ships Redis 7.0
sudo systemctl enable --now redis-server # start now and on every boot
redis-cli ping                           # -> PONG
```
`.env`:
```
REDIS_URL=redis://127.0.0.1:6379
```
By default Ubuntu's Redis only listens on 127.0.0.1, which is what you want on a laptop.

## Production
Use a managed Redis in the same region as the API and set `REDIS_URL` from the provider:

| Host | Service | URL form |
|---|---|---|
| Render | Key Value (Redis compatible) | `redis://red-xxxx:6379` (internal URL, same region) |
| Upstash | Redis | `rediss://default:<password>@<host>:6379` |
| AWS | ElastiCache for Redis | `rediss://<user>:<password>@<host>:6379` |

- Use `rediss://` (TLS) whenever the connection leaves a private network, and always set a password.
- Memory: a few MB is plenty (a handful of small keys per OTP request, all with an expiry).
- Eviction policy: `volatile-ttl` or `noeviction`; every key has a TTL.

## What happens without Redis
- `REDIS_URL` not set: the same limits run in the server's memory. That is fine for local development; in
  production the counters are lost on every restart and each instance counts separately, so the server logs an
  error at startup asking for `REDIS_URL`.
- `REDIS_URL` set but Redis is down: OTPs keep working. The limits fall back to memory, a warning is logged once a
  minute, and "Redis is back" is logged when it recovers. The client reconnects with backoff (at most every 30 s).

## Checking it
- Startup log: `[RateStore] OTP limits are stored in Redis.` (or why not)
- `GET /health` -> `"redis": "ok" | "unavailable" | "not_configured"`
- `GET /api/otp/settings` -> the countdown / limits the apps use
- Inspect keys: `redis-cli --scan --pattern 'darhub:*'` (e.g. `darhub:development:otp:cooldown:mobile:98XXXXXXXX`)

## Settings (all optional, defaults shown)
| Variable | Default | Meaning |
|---|---|---|
| `OTP_RESEND_COOLDOWN_SECONDS` | 30 | wait before "Resend OTP"; the apps show this exact countdown |
| `OTP_SEND_WINDOW_MINUTES` | 15 | window for the two send limits |
| `OTP_MAX_SENDS_PER_IP` | 5 | codes one network may request per window |
| `OTP_MAX_SENDS_PER_TARGET` | 5 | codes one phone number / email may receive per window |
| `OTP_MAX_VERIFY_ATTEMPTS` | 3 | wrong tries per code |
| `OTP_MAX_FAILED_VERIFIES` | 10 | wrong tries per phone/email per window before it is blocked |
| `OTP_BLOCK_MINUTES` | 15 | length of that block |
| `OTP_EXPIRY_SECONDS` | 180 | how long a code is valid |
