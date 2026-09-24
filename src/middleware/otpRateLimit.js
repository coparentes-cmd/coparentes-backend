import { prisma } from '../lib/prisma.js';

const RATE_LIMIT_MESSAGE = { error: 'Too many requests, try again later' };

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Wspólny klucz per-user dla limitów OTP (verify + issue). */
export function otpUserKey({ userId, email } = {}) {
  if (userId) return `user:${userId}`;
  const normalized = normalizeEmail(email);
  if (normalized) return `email:${normalized}`;
  return null;
}

/**
 * @param {Map<string, { count: number, windowStart: number, lockedUntil: number }>} buckets
 * @param {string} key
 * @param {{ max: number, windowMs: number, lockMs?: number }} opts
 * @returns {boolean} true = dozwolone (zużyto 1 punkt), false = zablokowane
 */
export function consumeRateLimitAttempt(buckets, key, { max, windowMs, lockMs = 0 }) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { count: 0, windowStart: now, lockedUntil: 0 };
    buckets.set(key, bucket);
  }

  if (bucket.lockedUntil > now) {
    return false;
  }

  if (now - bucket.windowStart >= windowMs) {
    bucket.count = 0;
    bucket.windowStart = now;
  }

  if (bucket.count >= max) {
    if (lockMs > 0) {
      bucket.lockedUntil = now + lockMs;
    }
    return false;
  }

  bucket.count += 1;
  return true;
}

/*
 * WARNING — in-memory rate limiting (single process only)
 *
 * otpVerifyBuckets and otpIssueBuckets live in this process's heap (Map),
 * not in Redis or the database.
 * - A process restart clears all counters and lockouts.
 * - With horizontal scaling (PM2 cluster, Docker replicas, k8s, autoscaling)
 *   limits are NOT shared across instances, which weakens OTP brute-force protection.
 * Before running more than one backend instance, replace this with a shared store
 * (e.g. Redis with TTL) instead of manual windowStart / lockedUntil in a local Map.
 * See also README.md → Known limitations.
 */
const otpVerifyBuckets = new Map();
const otpIssueBuckets = new Map();

const OTP_VERIFY = {
  max: 5,
  windowMs: 5 * 60 * 1000,
  lockMs: 15 * 60 * 1000
};

const OTP_ISSUE = {
  max: 3,
  windowMs: 15 * 60 * 1000,
  lockMs: 0
};

const BUCKET_CLEANUP_MS = 10 * 60 * 1000;

/**
 * Usuwa wpisy spoza aktywnego okna i bez aktywnego lockoutu.
 * @param {Map<string, { count: number, windowStart: number, lockedUntil: number }>} buckets
 * @param {number} windowMs
 */
export function pruneRateLimitBuckets(buckets, windowMs) {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    const windowExpired = now - bucket.windowStart > windowMs;
    const unlocked = bucket.lockedUntil < now;
    if (windowExpired && unlocked) {
      buckets.delete(key);
    }
  }
}

function startBucketCleanup() {
  setInterval(() => {
    pruneRateLimitBuckets(otpVerifyBuckets, OTP_VERIFY.windowMs);
    pruneRateLimitBuckets(otpIssueBuckets, OTP_ISSUE.windowMs);
  }, BUCKET_CLEANUP_MS).unref?.();
}

startBucketCleanup();

/** Clears in-memory OTP rate-limit buckets (for tests only). */
export function resetOtpRateLimitsForTests() {
  otpVerifyBuckets.clear();
  otpIssueBuckets.clear();
}

export function tryConsumeOtpVerifyAttempt(userKey) {
  if (!userKey) return false;
  return consumeRateLimitAttempt(
    otpVerifyBuckets,
    `otp-verify:${userKey}`,
    OTP_VERIFY
  );
}

export function tryConsumeOtpIssueAttempt(userKey) {
  if (!userKey) return false;
  return consumeRateLimitAttempt(
    otpIssueBuckets,
    `otp-issue:${userKey}`,
    OTP_ISSUE
  );
}

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
}

/** Middleware: verify OTP — klucz per userId z challenge (nie per challengeId). */
export async function otpVerifyLimiter(req, res, next) {
  try {
    const challengeId =
      typeof req.body?.challengeId === 'string' ? req.body.challengeId.trim() : '';

    let userKey = null;
    if (challengeId) {
      const challenge = await prisma.loginOtpChallenge.findUnique({
        where: { id: challengeId },
        select: { userId: true, user: { select: { email: true } } }
      });
      if (challenge) {
        userKey = otpUserKey({
          userId: challenge.userId,
          email: challenge.user?.email
        });
      }
    }

    // Nieznany challenge: nie spalaj limitu usera — fallback IP (anty-spam).
    if (!userKey) {
      userKey = `ip:${clientIp(req)}`;
    }

    if (!tryConsumeOtpVerifyAttempt(userKey)) {
      return res.status(429).json(RATE_LIMIT_MESSAGE);
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware: resend OTP — limit generowania per user z istniejącego challenge.
 * Przy przekroczeniu: 429, bez wywołania handlera (brak nowego challenge / email).
 */
export async function otpIssueFromChallengeLimiter(req, res, next) {
  try {
    const challengeId =
      typeof req.body?.challengeId === 'string' ? req.body.challengeId.trim() : '';

    if (!challengeId) {
      return next();
    }

    const challenge = await prisma.loginOtpChallenge.findUnique({
      where: { id: challengeId },
      select: { userId: true, user: { select: { email: true } } }
    });

    if (!challenge) {
      return next(); // handler zwróci invalid_challenge
    }

    const userKey = otpUserKey({
      userId: challenge.userId,
      email: challenge.user?.email
    });

    if (!tryConsumeOtpIssueAttempt(userKey)) {
      return res.status(429).json(RATE_LIMIT_MESSAGE);
    }
    return next();
  } catch (error) {
    return next(error);
  }
}
