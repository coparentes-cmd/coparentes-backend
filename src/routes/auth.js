import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../utils/tokens.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(150).optional(),
  workspaceName: z.string().trim().min(1).max(150).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional()
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});

function splitName(fullName) {
  if (!fullName) {
    return { firstName: null, lastName: null };
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: null, lastName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

function buildDisplayName(user) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.email;
}

function mapUserToFrontend(user, role = 'parentA') {
  return {
    id: user.id,
    name: buildDisplayName(user),
    email: user.email,
    role,
    twoFactorEnabled: false,
    highConflictMode: false,
    createdAt: new Date(user.createdAt).toISOString()
  };
}

async function buildWorkspaceForUser(user) {
  const links = await prisma.partnership.findMany({
    where: {
      OR: [
        { userId: user.id },
        { partnerId: user.id }
      ]
    }
  });

  const partnerIds = [
    ...new Set(
      links.map((item) => (item.userId === user.id ? item.partnerId : item.userId)).filter(Boolean)
    )
  ];

  const partners = partnerIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: partnerIds }
        }
      })
    : [];

  const members = [
    mapUserToFrontend(user, 'parentA'),
    ...partners.map((partner) => mapUserToFrontend(partner, 'parentB'))
  ];

  return {
    id: `workspace-${user.id}`,
    name: `Przestrzeń ${buildDisplayName(user)}`,
    inviteCode: null,
    members,
    children: [],
    createdAt: new Date(user.createdAt).toISOString()
  };
}

async function buildAuthResponse(user) {
  const safeUser = mapUserToFrontend(user, 'parentA');
  const workspace = await buildWorkspaceForUser(user);
  const token = signAccessToken({
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  });

  return {
    token,
    user: safeUser,
    workspace
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const fallbackName = splitName(data.name);
    const firstName = data.firstName ?? fallbackName.firstName;
    const lastName = data.lastName ?? fallbackName.lastName;

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName,
        lastName
      }
    });

    const payload = await buildAuthResponse(user);
    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = await buildAuthResponse(user);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get('/session', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = await buildAuthResponse(user);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(200).json({
      user: mapUserToFrontend(user, 'parentA')
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
