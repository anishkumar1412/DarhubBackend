import { createHmac } from 'crypto';

/**
 * Abuse protection for one-time codes. All limits come from the policy (env OTP_* settings):
 *
 *  sending   - a phone/email can get a new code only every `resendSeconds`            -> OTP_COOLDOWN
 *            - one IP may request `maxSendsPerIp` codes per window                      -> OTP_IP_LIMIT
 *            - one phone/email may receive `maxSendsPerTarget` codes per window          -> OTP_TARGET_LIMIT
 *  verifying - each code allows `maxVerifyAttempts` wrong tries (counted on the code)  -> OTP_ATTEMPTS_EXCEEDED
 *            - `maxFailedVerifies` wrong tries for a phone/email within a window block it,
 *              for sending AND verifying, for `blockSeconds`                            -> OTP_BLOCKED
 *
 * Every refusal carries `retryAfter` (seconds) so the app can show an exact countdown.
 * The store is injected (Redis in the server, memory in tests).
 */
export const createOtpGuard = ({ store, policy }) => {
  const targetsOf = ({ email, mobile }) => [email && `email:${email}`, mobile && `mobile:${mobile}`].filter(Boolean);
  const k = (kind, id) => `otp:${kind}:${id}`;

  const refuse = (status, code, message, retryAfter, extra = {}) => ({ ok: false, status, code, message, retryAfter, ...extra });

  const wait = (seconds) => {
    if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  };

  const blockedFor = async (targets) => Math.max(0, ...(await Promise.all(targets.map((t) => store.ttl(k('block', t))))));

  /**
   * Called before a code is created. On success the caller MUST call `sent()` after delivering the code, or
   * `release()` if delivery failed (so the person can retry at once instead of waiting out a cooldown).
   */
  const beforeSend = async ({ ip, email, mobile }) => {
    const targets = targetsOf({ email, mobile });

    // Check block + cooldown in parallel (read-only, no side effects)
    const [blocked, coolingTtls] = await Promise.all([
      blockedFor(targets),
      Promise.all(targets.map((t) => store.ttl(k('cooldown', t)))),
    ]);
    if (blocked > 0) {
      return refuse(429, 'OTP_BLOCKED', `Too many wrong codes. For your security, try again in ${wait(blocked)}.`, blocked);
    }
    const cooling = Math.max(0, ...coolingTtls);
    if (cooling > 0) {
      return refuse(429, 'OTP_COOLDOWN', `Please wait ${wait(cooling)} before requesting a new code.`, cooling, { resendAfterSeconds: cooling });
    }

    // Increment IP + all per-target send counters in parallel
    const [perIp, ...perTargets] = await Promise.all([
      store.increment(k('ip', ip || 'unknown'), policy.windowSeconds),
      ...targets.map((t) => store.increment(k('sends', t), policy.windowSeconds)),
    ]);
    if (perIp.count > policy.maxSendsPerIp) {
      return refuse(429, 'OTP_IP_LIMIT', `Too many code requests from this network. Try again in ${wait(perIp.ttl)}.`, perIp.ttl);
    }
    let targetRemaining = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const perTarget = perTargets[i];
      if (perTarget.count > policy.maxSendsPerTarget) {
        return refuse(429, 'OTP_TARGET_LIMIT', `Too many codes were sent to this ${targets[i].startsWith('email') ? 'email address' : 'mobile number'}. Try again in ${wait(perTarget.ttl)}.`, perTarget.ttl);
      }
      targetRemaining = Math.min(targetRemaining, policy.maxSendsPerTarget - perTarget.count);
    }

    // The cooldown is claimed atomically: two requests at the same moment cannot both send a code
    const claimed = [];
    for (const t of targets) {
      const lock = await store.acquire(k('cooldown', t), policy.resendSeconds);
      if (!lock.acquired) {
        await store.remove(...claimed);
        return refuse(429, 'OTP_COOLDOWN', `Please wait ${wait(lock.ttl)} before requesting a new code.`, lock.ttl, { resendAfterSeconds: lock.ttl });
      }
      claimed.push(k('cooldown', t));
    }

    return {
      ok: true,
      resendAfterSeconds: policy.resendSeconds,
      sendsRemaining: Math.max(0, Math.min(policy.maxSendsPerIp - perIp.count, targetRemaining)),
      release: () => store.remove(...claimed),
    };
  };

  /** Before checking a code: a blocked phone/email cannot verify either. */
  const beforeVerify = async ({ email, mobile }) => {
    const blocked = await blockedFor(targetsOf({ email, mobile }));
    return blocked > 0
      ? refuse(429, 'OTP_BLOCKED', `Too many wrong codes. For your security, try again in ${wait(blocked)}.`, blocked)
      : { ok: true };
  };

  /** A wrong code. Returns { blocked, retryAfter } when this try crossed the limit. */
  const failedVerify = async ({ email, mobile }) => {
    let blocked = 0;
    for (const t of targetsOf({ email, mobile })) {
      const fails = await store.increment(k('fails', t), policy.windowSeconds);
      if (fails.count >= policy.maxFailedVerifies) {
        await store.acquire(k('block', t), policy.blockSeconds);
        blocked = Math.max(blocked, await store.ttl(k('block', t)));
      }
    }
    return blocked > 0 ? { blocked: true, retryAfter: blocked, message: `Too many wrong codes. For your security, try again in ${wait(blocked)}.` } : { blocked: false };
  };

  /** A correct code clears the wrong-try history and lets a new code be requested immediately if ever needed. */
  const succeededVerify = async ({ email, mobile }) => {
    const targets = targetsOf({ email, mobile });
    await store.remove(...targets.map((t) => k('fails', t)));
  };

  return { beforeSend, beforeVerify, failedVerify, succeededVerify, policy };
};

/**
 * Codes are stored as an HMAC, never as the code itself: a database leak must not reveal codes that can still
 * be used (and a plain SHA-256 of a 6-digit number can be reversed by trying all million values).
 */
export const hashOtp = (code, secret = process.env.JWT_SECRET) =>
  createHmac('sha256', String(secret)).update(String(code).trim()).digest('hex');
