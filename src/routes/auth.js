import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  buildAuthPayload,
  createWorkspace,
  findWorkspaceByInviteCode
} from '../services/workspace.js';
import { createSessionForUser, deleteAllSessionsForUser, deleteSession } from '../services/session.js';

const router = express.Router();

const authActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' }
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10),
  workspaceName: z.string().min(2)
});

const joinSchema = z.object({
  inviteCode: z.string().min(6),
  name: z.string().min(2),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10)
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});

async function issueSessionResponse(user, statusCode, res) {
  const token = await createSessionForUser(user.id);
  const { user: serializedUser, workspace } = await buildAuthPayload(user);

  return res.status(statusCode).json({
    token,
    user: serializedUser,
    workspace
  });
}

router.post('/register', authActionLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existing) {
      return res.status(409).json({ error: 'email_in_use' });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const workspace = await createWorkspace({ name: data.workspaceName, client: tx });
      return tx.user.create({
        data: {
          workspaceId: workspace.id,
          name: data.name,
          email: data.email,
          passwordHash,
          role: 'parentA',
          twoFactorEnabled: false,
          highConflictMode: false
        }
      });
    });

    return issueSessionResponse(user, 201, res);
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

    const existing = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existing) {
      return res.status(409).json({ error: 'email_in_use' });
    }

    const workspace = await findWorkspaceByInviteCode(data.inviteCode);
    if (!workspace) {
      return res.status(404).json({ error: 'workspace_not_found' });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'parentB',
        twoFactorEnabled: false,
        highConflictMode: false
      }
    });

    return issueSessionResponse(user, 201, res);
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

    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    if (!user.workspaceId) {
      return res.status(403).json({ error: 'user_missing_workspace' });
    }

    return issueSessionResponse(user, 200, res);
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

router.get('/session', requireAuth, async (req, res, next) => {
  try {
    const { user: serializedUser, workspace } = await buildAuthPayload(req.user);

    return res.status(200).json({
      token: req.sessionToken,
      user: serializedUser,
      workspace
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await deleteSession(req.sessionToken);
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
    const updates = {};

    if (data.name !== undefined) {
      updates.name = data.name;
    }
    if (data.highConflictMode !== undefined) {
      updates.highConflictMode = data.highConflictMode;
    }
    if (data.twoFactorEnabled !== undefined) {
      updates.twoFactorEnabled = data.twoFactorEnabled;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updates
    });

    const { user: serializedUser, workspace } = await buildAuthPayload(user);

    return res.status(200).json({
      token: req.sessionToken,
      user: serializedUser,
      workspace
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

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });
    await deleteAllSessionsForUser(user.id);

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
