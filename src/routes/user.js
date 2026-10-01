import express from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { isValidX25519PublicKeyBase64 } from '../utils/x25519PublicKey.js';
import { PASSWORD_MIN_LENGTH } from '../utils/passwordPolicy.js';
import { sendRecoveryCodeEmail } from '../utils/mailer.js';

const router = express.Router();

const RATE_LIMIT_MESSAGE = { error: 'Too many requests, try again later' };

// WARNING: express-rate-limit MemoryStore — per-process only (same as auth.js).
const keysWithPasswordLimiterStore = new MemoryStore();
/**
 * R5: bcrypt gate on optional currentPassword — count only when password is sent.
 * `skip: true` bypasses entirely (no increment) — see express-rate-limit source.
 * Keyed per authenticated userId (requireAuth runs first).
 */
const keysWithPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  keyGenerator: (req) => `user-keys-pw:${req.user?.id || 'unknown'}`,
  skip: (req) => {
    const pw = req.body?.currentPassword;
    return typeof pw !== 'string' || pw.length === 0;
  },
  store: keysWithPasswordLimiterStore
});

const recoveryKeyLimiterStore = new MemoryStore();
/**
 * R5: every call may send e-mail + overwrite recoveryKeyEnvelope.
 * Keyed per authenticated userId (requireAuth runs first).
 */
const recoveryKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  keyGenerator: (req) => `user-recovery-key:${req.user?.id || 'unknown'}`,
  store: recoveryKeyLimiterStore
});

/** Clears user-route express-rate-limit MemoryStores (for tests only). */
export async function resetUserRateLimitersForTests() {
  await Promise.all([
    keysWithPasswordLimiterStore.resetAll(),
    recoveryKeyLimiterStore.resetAll()
  ]);
}

const keysBodySchema = z.object({
  publicKey: z.string().min(1),
  privateKeyEnvelope: z.string().min(1).max(4000),
  // Optional: when set, verify identity via bcrypt before overwriting keys
  // (orphaned-envelope recovery). Omitted by initial setupNewKeys.
  currentPassword: z.string().min(PASSWORD_MIN_LENGTH).optional()
});

const recoveryKeyBodySchema = z.object({
  recoveryKeyEnvelope: z.string().min(1).max(4000),
  recoveryCode: z.string().min(8).max(64)
});

/**
 * POST /api/user/keys
 * Upload / replace the current user's X25519 public key + opaque private-key envelope (E2E).
 * Backend never interprets privateKeyEnvelope internals.
 *
 * Optional `currentPassword`: when present, must match passwordHash (401 otherwise).
 * When omitted, behaviour is unchanged (auth session alone is enough) for bootstrap.
 *
 * Rate limit (R5): 5 / 15 min per userId — only requests that include currentPassword
 * (bcrypt surface). Bootstrap without password is skipped by the limiter.
 */
router.post('/keys', requireAuth, keysWithPasswordLimiter, async (req, res, next) => {
  try {
    const data = keysBodySchema.parse(req.body);

    if (!isValidX25519PublicKeyBase64(data.publicKey)) {
      return res.status(400).json({ error: 'invalid_public_key' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        publicKey: true,
        privateKeyEnvelope: true,
        passwordHash: true
      }
    });

    if (data.currentPassword) {
      if (
        !existing?.passwordHash ||
        !(await bcrypt.compare(data.currentPassword, existing.passwordHash))
      ) {
        return res.status(401).json({ error: 'invalid_credentials' });
      }
    }

    if (existing?.publicKey || existing?.privateKeyEnvelope) {
      // Overwrite allowed (new device / key loss / post-reset). Old ThreadKey rows for this user
      // become undecryptable with a new private key — track the event (no key material).
      console.log(
        '[e2e] keys overwritten',
        'userId=',
        req.user.id,
        'at=',
        new Date().toISOString()
      );
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        publicKey: data.publicKey,
        privateKeyEnvelope: data.privateKeyEnvelope
      }
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

/**
 * GET /api/user/keys/mine
 * Return the authenticated user's own publicKey + privateKeyEnvelope
 * (+ recoveryKeyEnvelope when present). Never returns the recovery code itself.
 */
router.get('/keys/mine', requireAuth, async (req, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        publicKey: true,
        privateKeyEnvelope: true,
        recoveryKeyEnvelope: true
      }
    });

    return res.status(200).json({
      publicKey: me?.publicKey ?? null,
      privateKeyEnvelope: me?.privateKeyEnvelope ?? null,
      recoveryKeyEnvelope: me?.recoveryKeyEnvelope ?? null
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/user/recovery-key
 * Store opaque recoveryKeyEnvelope and e-mail the plaintext recovery code.
 * On non-timeout mail failure, roll back recoveryKeyEnvelope to previous value.
 * On email_send_timeout, keep the new envelope and return 503 (client may retry mail-only later).
 *
 * Rate limit (R5): 5 / 15 min per userId (e-mail + envelope overwrite abuse).
 */
router.post('/recovery-key', requireAuth, recoveryKeyLimiter, async (req, res, next) => {
  try {
    const data = recoveryKeyBodySchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true, recoveryKeyEnvelope: true }
    });

    if (!existing?.email) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const previousEnvelope = existing.recoveryKeyEnvelope ?? null;

    await prisma.user.update({
      where: { id: req.user.id },
      data: { recoveryKeyEnvelope: data.recoveryKeyEnvelope }
    });

    const emailResult = await sendRecoveryCodeEmail({
      to: existing.email,
      recoveryCode: data.recoveryCode
    });

    if (emailResult.emailSent !== true) {
      const code = emailResult.error || 'otp_email_failed';
      const providerMessage =
        emailResult.details?.message || emailResult.message || null;

      console.error(
        '[e2e] recovery-key e-mail failed:',
        code,
        providerMessage,
        'userId=',
        req.user.id
      );

      // Timeout: envelope already saved — do not roll back (client may have the code).
      if (code !== 'email_send_timeout') {
        await prisma.user
          .update({
            where: { id: req.user.id },
            data: { recoveryKeyEnvelope: previousEnvelope }
          })
          .catch(() => {});
      }

      return res.status(503).json({
        error:
          code === 'email_not_configured' || code === 'email_send_timeout'
            ? code
            : 'otp_email_failed',
        ...(providerMessage
          ? { reason: String(providerMessage).slice(0, 240) }
          : {})
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

/**
 * GET /api/user/:userId/public-key
 * Fetch another workspace member's public key (or null if not set yet).
 * Never returns privateKeyEnvelope.
 */
router.get('/:userId/public-key', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, workspaceId: true, publicKey: true }
    });

    if (!target) {
      return res.status(404).json({ error: 'not_found' });
    }

    if (
      !req.user.workspaceId ||
      !target.workspaceId ||
      target.workspaceId !== req.user.workspaceId
    ) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.status(200).json({ publicKey: target.publicKey ?? null });
  } catch (error) {
    return next(error);
  }
});

export default router;
