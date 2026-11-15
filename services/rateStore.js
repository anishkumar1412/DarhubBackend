import Redis from 'ioredis';
import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Short-lived counters and locks with an expiry (OTP cooldowns, send limits, blocks).
 *
 * Redis when REDIS_URL is set: the limits are shared by every server instance and survive restarts.
 * Without Redis (or while Redis is unreachable) the same rules run in this process's memory, so OTPs keep
 * working; the only loss is that each instance counts separately. Every method returns plain numbers/booleans.
 */

// ── In-memory implementation ─────────────────────────────────────
export class MemoryStore {
  constructor() {
    this.entries = new Map();
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  sweep(now = Date.now()) {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
  }

  live(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) { this.entries.delete(key); return null; }
    return entry;
  }

  /** Adds 1 to a counter that expires `ttlSeconds` after its FIRST hit. Returns the count and seconds left. */
  async increment(key, ttlSeconds) {
    let entry = this.live(key);
    if (!entry) { entry = { value: 0, expiresAt: Date.now() + ttlSeconds * 1000 }; this.entries.set(key, entry); }
    entry.value += 1;
    return { count: entry.value, ttl: Math.ceil((entry.expiresAt - Date.now()) / 1000) };
  }

  /** Sets the key only if absent. Returns { acquired, ttl } (ttl = seconds left on whichever value is there). */
  async acquire(key, ttlSeconds) {
    const entry = this.live(key);
    if (entry) return { acquired: false, ttl: Math.ceil((entry.expiresAt - Date.now()) / 1000) };
    this.entries.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
    return { acquired: true, ttl: ttlSeconds };
  }

  /** Seconds before the key expires; 0 when it does not exist. */
  async ttl(key) {
    const entry = this.live(key);
    return entry ? Math.ceil((entry.expiresAt - Date.now()) / 1000) : 0;
  }

  async count(key) {
    return this.live(key)?.value ?? 0;
  }

  async remove(...keys) {
    for (const key of keys) this.entries.delete(key);
  }

  async close() {
    clearInterval(this.sweeper);
  }
}

// ── Redis implementation ─────────────────────────────────────────
// INCR + "expire only on the first hit" in one atomic step (works on every Redis version, unlike EXPIRE ... NX)
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`;

export class RedisStore {
  constructor(url, { keyPrefix = env.REDIS_KEY_PREFIX } = {}) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,        // fail fast: the caller falls back to memory instead of hanging a request
      enableOfflineQueue: false,
      connectTimeout: 3000,
      keyPrefix,
      connectionName: `darhub-api-${env.NODE_ENV}`,
      // Keep trying to reconnect, but back off (0.5 s, 1 s, 2 s ... at most every 30 s) instead of hammering Redis
      retryStrategy: (attempt) => Math.min(500 * 2 ** (attempt - 1), 30_000),
    });
    let lastLog = 0;
    this.client.on('error', (err) => {
      if (Date.now() - lastLog > 60_000) { lastLog = Date.now(); logger.warn(`[Redis] ${err.message}`); }
    });
    this.client.on('ready', () => logger.info(`[Redis] connected (key prefix "${keyPrefix}")`));
    this.client.defineCommand('incrementWithTtl', { numberOfKeys: 1, lua: INCREMENT_SCRIPT });
  }

  async increment(key, ttlSeconds) {
    const [count, ttl] = await this.client.incrementWithTtl(key, ttlSeconds);
    return { count: Number(count), ttl: Math.max(Number(ttl), 0) };
  }

  async acquire(key, ttlSeconds) {
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    if (result === 'OK') return { acquired: true, ttl: ttlSeconds };
    return { acquired: false, ttl: Math.max(await this.client.ttl(key), 0) };
  }

  async ttl(key) {
    return Math.max(await this.client.ttl(key), 0);
  }

  async count(key) {
    return Number(await this.client.get(key)) || 0;
  }

  async remove(...keys) {
    if (keys.length) await this.client.del(...keys);
  }

  /** Waits (up to 3 s) for the connection, then pings: with the offline queue off a command sent too early fails. */
  async ping() {
    if (this.client.status !== 'ready') {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
        this.client.once('ready', () => { clearTimeout(timer); resolve(); });
        this.client.once('end', () => { clearTimeout(timer); reject(new Error('Redis connection closed')); });
      });
    }
    return (await this.client.ping()) === 'PONG';
  }

  async close() {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

// ── Redis first, memory when Redis cannot answer ─────────────────
export class FallbackStore {
  constructor(primary, secondary) {
    this.primary = primary;
    this.secondary = secondary;
    this.degraded = false;
    let lastWarning = 0;
    for (const method of ['increment', 'acquire', 'ttl', 'count', 'remove']) {
      this[method] = async (...args) => {
        try {
          const result = await this.primary[method](...args);
          if (this.degraded) { this.degraded = false; logger.info('[RateStore] Redis is back: OTP limits are shared again.'); }
          return result;
        } catch (err) {
          this.degraded = true;
          if (Date.now() - lastWarning > 60_000) {   // once a minute, not on every request
            lastWarning = Date.now();
            logger.warn(`[RateStore] Redis unavailable (${err.message}); OTP limits run in this process's memory until it is back.`);
          }
          return this.secondary[method](...args);
        }
      };
    }
  }

  async status() {
    try { return (await this.primary.ping()) ? 'ok' : 'unavailable'; } catch { return 'unavailable'; }
  }

  async close() {
    await Promise.all([this.primary.close(), this.secondary.close()]);
  }
}

const createStore = () => {
  if (env.REDIS_URL) return new FallbackStore(new RedisStore(env.REDIS_URL), new MemoryStore());
  const memory = new MemoryStore();
  memory.status = async () => 'not_configured';
  return memory;
};

/** One line at startup saying where OTP limits live, so a missing or unreachable Redis is noticed immediately. */
export const logRateStoreStatus = async () => {
  const status = await getRateStore().status();
  if (status === 'ok') {
    logger.info('[RateStore] OTP limits are stored in Redis.');
  } else if (status === 'not_configured') {
    const message = '[RateStore] REDIS_URL is not set: OTP limits are kept in memory (lost on restart, not shared between instances).';
    if (env.NODE_ENV === 'production') logger.error(`${message} Set REDIS_URL in production.`);
    else logger.info(message);
  } else {
    logger.warn(`[RateStore] Redis at REDIS_URL is not reachable: OTP limits run in memory until it is.`);
  }
};

// Created on first use, so importing this module (tests, scripts) never opens a Redis connection by itself
let instance = null;
export const getRateStore = () => (instance ||= createStore());

/** Closes the store if it was ever opened (server shutdown). */
export const closeRateStore = async () => {
  if (instance) await instance.close();
  instance = null;
};
