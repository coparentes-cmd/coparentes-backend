import express from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  TRUSTED_DEVICE_COOKIE,
  trustedDeviceCookieOptions
} from '../services/trustedDevice.service.js';
import {
  clearSessionCookie,
  setSessionCookie
} from '../services/sessionCookie.service.js';
import {
  authenticateChildAccess,
  buildSessionPayload,
  changeUserPassword,
  fetchChildJoinPreview,
  getSessionPayload,
  issueLoginOtp,
  joinWorkspace,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resendLoginOtp,
  updateUserProfile,
  verifyLoginOtp
} from '../services/authService.js';
import {
  otpIssueFromChallengeLimiter,
  otpUserKey,
  otpVerifyLimiter,
  tryConsumeOtpIssueAttempt
} from '../middleware/otpRateLimit.js';

const router = express.Router();

const OTP_RATE_LIMIT_MESSAGE = { error: 'Too many requests, try again later' };

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
}

// WARNING: express-rate-limit default MemoryStore — per-process only.
// Same single-instance limitation as otpRateLimit.js Maps (see README → Known limitations).
const authActionLimiterStore = new MemoryStore();
const authActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
  store: authActionLimiterStore
});

// WARNING: default MemoryStore — per-process only (see otpRateLimit.js / README → Known limitations).
const loginIpLimiterStore = new MemoryStore();
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
  keyGenerator: (req) => `login-ip:${clientIp(req) || req.ip || 'unknown'}`,
  store: loginIpLimiterStore
});

// WARNING: default MemoryStore — per-process only (see otpRateLimit.js / README → Known limitations).
const loginEmailLimiterStore = new MemoryStore();
const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
    const ip = clientIp(req) || req.ip || 'unknown';
    return email ? `login-email:${email}` : `login-email-ip:${ip}`;
  },
  store: loginEmailLimiterStore
});

// WARNING: default MemoryStore — per-process only (see otpRateLimit.js / README → Known limitations).
const registerIpLimiterStore = new MemoryStore();
const registerIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
  keyGenerator: (req) => `register-ip:${clientIp(req) || req.ip || 'unknown'}`,
  store: registerIpLimiterStore
});

const forgotPasswordLimiterStore = new MemoryStore();

/** Clears auth express-rate-limit MemoryStores (for tests only). */
export async function resetAuthRateLimitersForTests() {
  await Promise.all([
    authActionLimiterStore.resetAll(),
    loginIpLimiterStore.resetAll(),
    loginEmailLimiterStore.resetAll(),
    registerIpLimiterStore.resetAll(),
    forgotPasswordLimiterStore.resetAll()
  ]);
}

const consentsSchema = z.object({
  TERMS: z.boolean(),
  DATA_PROCESSING: z.boolean(),
  CHILD_DATA: z.boolean(),
  EMAIL_NOTIFICATIONS: z.boolean(),
  MARKETING: z.boolean(),
  ANALYTICS: z.boolean()
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10),
  workspaceName: z.string().min(2),
  consents: consentsSchema
});

const joinSchema = z
  .object({
    inviteCode: z.string().min(6).optional(),
    childInviteCode: z.string().min(6).optional(),
    name: z.string().min(2),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(10),
    childProfileId: z.string().optional()
  })
  .refine((data) => data.inviteCode || data.childInviteCode, {
    message: 'invite_code_required'
  });

const childJoinPreviewSchema = z.object({
  childInviteCode: z.string().min(6)
});

const childAccessSchema = z.object({
  childInviteCode: z.string().min(6),
  dateOfBirth: z.string().datetime(),
  password: z.string().min(10),
  name: z.string().trim().min(2).optional()
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});

async function issueSessionResponse(user, statusCode, res, { trustedDeviceToken } = {}) {
  const payload = await buildSessionPayload(user);

  setSessionCookie(res, payload.token);

  if (trustedDeviceToken) {
    res.cookie(TRUSTED_DEVICE_COOKIE, trustedDeviceToken, trustedDeviceCookieOptions());
  }

  return res.status(statusCode).json({
    token: payload.token,
    user: payload.user,
    workspace: payload.workspace,
    ...(trustedDeviceToken ? { trustedDeviceToken } : {})
  });
}

router.post('/register', registerIpLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await registerUser({
      ...data,
      ipAddress: clientIp(req)
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return issueSessionResponse(result.user, result.status, res);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.get('/join-preview', authActionLimiter, async (req, res, next) => {
  try {
    const data = childJoinPreviewSchema.parse({
      childInviteCode: req.query.childInviteCode
    });

    const result = await fetchChildJoinPreview(data.childInviteCode);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json(result.preview);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/child/access', authActionLimiter, async (req, res, next) => {
  try {
    const data = childAccessSchema.parse(req.body);
    const result = await authenticateChildAccess(data);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return issueSessionResponse(result.user, result.status, res);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/join', authActionLimiter, async (req, res, next) => {
  try {
    const data = joinSchema.parse(req.body);
    const result = await joinWorkspace(data);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return issueSessionResponse(result.user, result.status, res);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/login', loginIpLimiter, loginEmailLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await loginUser({ ...data, req });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    // Password OK + OTP required: enforce issue limit BEFORE creating challenge / sending email.
    // (otpIssueFromChallengeLimiter cannot cover this path — body has no challengeId yet.)
    if (result.requiresOtp) {
      const user = result.user;
      const issueKey = otpUserKey({ userId: user.id, email: user.email });
      if (!tryConsumeOtpIssueAttempt(issueKey)) {
        return res.status(429).json(OTP_RATE_LIMIT_MESSAGE);
      }

      const issued = await issueLoginOtp(user);
      if (issued.error) {
        return res.status(issued.status).json({ error: issued.error });
      }

      return res.status(issued.status).json({
        requiresOtp: true,
        challengeId: issued.challengeId,
        email: issued.email,
        expiresAt: issued.expiresAt,
        resendAvailableAt: issued.resendAvailableAt
      });
    }

    return issueSessionResponse(result.user, result.status, res);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    if (error?.message === 'user_missing_workspace') {
      return res.status(403).json({ error: 'user_missing_workspace' });
    }
    return next(error);
  }
});

const verifyOtpSchema = z.object({
  challengeId: z.string().min(8),
  code: z.string().regex(/^\d{6}$/),
  trustDevice: z.boolean().optional()
});

router.post(
  '/login/verify-otp',
  authActionLimiter,
  otpVerifyLimiter,
  async (req, res, next) => {
    try {
      const data = verifyOtpSchema.parse(req.body);
      const result = await verifyLoginOtp(data);

      if (result.error) {
        if (result.error === 'invalid_otp') {
          return res.status(result.status).json({
            error: 'invalid_otp',
            attemptsRemaining: result.attemptsRemaining,
            locked: result.locked
          });
        }
        return res.status(result.status).json({ error: result.error });
      }

      return issueSessionResponse(result.user, result.status, res, {
        trustedDeviceToken: result.trustedDeviceToken
      });
    } catch (error) {
      if (error?.name === 'ZodError') {
        return res.status(400).json({ error: 'invalid_request' });
      }
      return next(error);
    }
  }
);

const resendOtpSchema = z.object({
  challengeId: z.string().min(8)
});

router.post(
  '/login/resend-otp',
  authActionLimiter,
  otpIssueFromChallengeLimiter,
  async (req, res, next) => {
    try {
      const data = resendOtpSchema.parse(req.body);
      const result = await resendLoginOtp(data.challengeId);

      if (result.error) {
        if (result.error === 'resend_cooldown') {
          return res.status(result.status).json({
            error: 'resend_cooldown',
            resendAvailableAt: result.resendAvailableAt
          });
        }
        return res.status(result.status).json({ error: result.error });
      }

      return res.status(result.status).json({
        challengeId: result.challengeId,
        email: result.email,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt
      });
    } catch (error) {
      if (error?.name === 'ZodError') {
        return res.status(400).json({ error: 'invalid_request' });
      }
      return next(error);
    }
  }
);

router.get('/session', requireAuth, async (req, res, next) => {
  try {
    const payload = await getSessionPayload(req.user, req.sessionToken);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await logoutUser(req.sessionToken);
    clearSessionCookie(res);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  highConflictMode: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional()
});

router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const data = profileSchema.parse(req.body);
    const result = await updateUserProfile(req.user.id, req.sessionToken, data);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(result.status).json({
      token: result.token,
      user: result.user,
      workspace: result.workspace
    });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

const passwordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
  // Required by service when user already has privateKeyEnvelope (E2E).
  newPrivateKeyEnvelope: z.string().min(1).max(4000).optional()
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

// WARNING: default MemoryStore — per-process only (see otpRateLimit.js / README Known limitations).
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
    const ip = clientIp(req) || req.ip || 'unknown';
    return email ? `forgot:${email}` : `forgot-ip:${ip}`;
  },
  store: forgotPasswordLimiterStore
});

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  async (req, res, next) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      const result = await requestPasswordReset(data.email);

      if (result.error) {
        return res.status(result.status).json({
          error: result.error,
          ...(result.reason ? { reason: result.reason } : {})
        });
      }

      return res.status(result.status).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      if (error?.name === 'ZodError') {
        return res.status(400).json({ error: 'invalid_request' });
      }
      return next(error);
    }
  }
);

router.post('/password', requireAuth, authActionLimiter, async (req, res, next) => {
  try {
    const data = passwordSchema.parse(req.body);
    const result = await changeUserPassword(req.user.id, data);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(result.status).json({ success: result.success });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
