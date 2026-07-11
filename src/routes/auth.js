import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  TRUSTED_DEVICE_COOKIE,
  trustedDeviceCookieOptions
} from '../services/trustedDevice.service.js';
import {
  authenticateChildAccess,
  buildSessionPayload,
  changeUserPassword,
  fetchChildJoinPreview,
  getSessionPayload,
  joinWorkspace,
  loginUser,
  logoutUser,
  registerUser,
  resendLoginOtp,
  updateUserProfile,
  verifyLoginOtp
} from '../services/authService.js';

const router = express.Router();

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
}

const authActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' }
});

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

router.post('/register', authActionLimiter, async (req, res, next) => {
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

router.post('/login', authActionLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await loginUser({ ...data, req });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    if (result.requiresOtp) {
      return res.status(result.status).json({
        requiresOtp: true,
        challengeId: result.challengeId,
        email: result.email,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt
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

router.post('/login/verify-otp', authActionLimiter, async (req, res, next) => {
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
});

const resendOtpSchema = z.object({
  challengeId: z.string().min(8)
});

router.post('/login/resend-otp', authActionLimiter, async (req, res, next) => {
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
});

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
  newPassword: z.string().min(8)
});

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
