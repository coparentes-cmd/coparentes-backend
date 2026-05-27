import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { addDays } from '../utils/time.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireParentRole } from '../middleware/rbac.js';
import { sendInviteEmail } from '../utils/mailer.js';
import { env } from '../utils/env.js';
import { v4 as uuidv4 } from 'uuid';
import { getWorkspaceGraph } from '../services/workspace.js';
import { serializeEmailInvite } from '../services/serializers.js';

const router = express.Router();

const inviteSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' }
});

const sendInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

router.post('/send', inviteSendLimiter, requireAuth, requireParentRole, async (req, res, next) => {
  try {
    const data = sendInviteSchema.parse(req.body);

    if (data.email === req.user.email) {
      return res.status(400).json({ error: 'cannot_invite_self' });
    }

    const token = uuidv4();
    const invite = await prisma.emailInvite.create({
      data: {
        email: data.email,
        token,
        inviterId: req.user.id,
        expiresAt: addDays(new Date(), env.inviteExpiresDays)
      }
    });

    const acceptUrl = `${env.frontendUrl}/invite/accept/${invite.token}`;
    const emailResult = await sendInviteEmail({
      to: invite.email,
      acceptUrl,
      inviterEmail: req.user.email
    });

    return res.status(201).json({
      invite: serializeEmailInvite(invite),
      emailSent: emailResult.emailSent === true
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/accept', requireAuth, async (req, res, next) => {
  try {
    const bodySchema = z.object({ token: z.string().min(1) });
    const { token } = bodySchema.parse(req.body);

    const invite = await prisma.emailInvite.findUnique({ where: { token } });

    if (!invite) {
      return res.status(404).json({ error: 'invite_not_found' });
    }

    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'invite_not_active' });
    }

    if (invite.expiresAt < new Date()) {
      await prisma.emailInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' }
      });
      return res.status(400).json({ error: 'invite_expired' });
    }

    const inviter = await prisma.user.findUnique({
      where: { id: invite.inviterId }
    });

    if (!inviter?.workspaceId) {
      return res.status(400).json({ error: 'inviter_missing_workspace' });
    }

    if (req.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({ error: 'invite_email_mismatch' });
    }

    const [userWorkspaceMembers, inviterWorkspaceMembers] = await Promise.all([
      prisma.user.count({ where: { workspaceId: req.user.workspaceId } }),
      prisma.user.count({ where: { workspaceId: inviter.workspaceId } })
    ]);

    if (userWorkspaceMembers > 1 || inviterWorkspaceMembers >= 2) {
      return res.status(409).json({ error: 'workspace_conflict' });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user.id },
        data: {
          workspaceId: inviter.workspaceId,
          role: 'parentB'
        }
      }),
      prisma.emailInvite.update({
        where: { id: invite.id },
        data: {
          status: 'ACCEPTED',
          acceptedBy: req.user.id,
          acceptedAt: new Date()
        }
      })
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/sent', requireAuth, async (req, res, next) => {
  try {
    const invites = await prisma.emailInvite.findMany({
      where: { inviterId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return res.status(200).json({
      invites: invites.map(serializeEmailInvite)
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/partnership', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.workspaceId) {
      return res.status(200).json({ partnerships: [] });
    }

    const workspace = await getWorkspaceGraph(req.user.workspaceId);
    const partners = workspace.members.filter((member) => member.id !== req.user.id);

    return res.status(200).json({
      partnerships: partners.map((partner) => ({
        id: partner.id,
        partnerId: partner.id,
        createdAt: partner.createdAt
      }))
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
