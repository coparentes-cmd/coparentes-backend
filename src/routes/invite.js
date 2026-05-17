import express from 'express';
import { z } from 'zod';
import { addDays } from '../utils/time.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { sendInviteEmail } from '../utils/mailer.js';
import { env } from '../utils/env.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const sendInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

router.post('/send', requireAuth, async (req, res, next) => {
  try {
    const data = sendInviteSchema.parse(req.body);

    if (data.email === req.user.email) {
      return res.status(400).json({ error: 'Cannot invite yourself' });
    }

    const token = uuidv4();
    const invite = await prisma.invite.create({
      data: {
        email: data.email,
        token,
        inviterId: req.user.id,
        expiresAt: addDays(new Date(), env.inviteExpiresDays)
      }
    });

    const acceptUrl = `${env.frontendUrl}/invite/accept?token=${invite.token}`;
    await sendInviteEmail({
      to: invite.email,
      acceptUrl,
      inviterEmail: req.user.email
    });

    return res.status(201).json({
      invite: {
        id: invite.id,
        email: invite.email,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/accept', requireAuth, async (req, res, next) => {
  try {
    const bodySchema = z.object({ token: z.string().min(1) });
    const { token } = bodySchema.parse(req.body);

    const invite = await prisma.invite.findUnique({ where: { token } });

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invite is no longer active' });
    }

    if (invite.expiresAt < new Date()) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' }
      });
      return res.status(400).json({ error: 'Invite expired' });
    }

    const inviterId = invite.inviterId;
    const accepterId = req.user.id;

    await prisma.$transaction([
      prisma.partnership.upsert({
        where: {
          userId_partnerId: {
            userId: inviterId,
            partnerId: accepterId
          }
        },
        create: {
          userId: inviterId,
          partnerId: accepterId
        },
        update: {}
      }),
      prisma.partnership.upsert({
        where: {
          userId_partnerId: {
            userId: accepterId,
            partnerId: inviterId
          }
        },
        create: {
          userId: accepterId,
          partnerId: inviterId
        },
        update: {}
      }),
      prisma.invite.update({
        where: { id: invite.id },
        data: {
          status: 'ACCEPTED',
          acceptedBy: accepterId,
          acceptedAt: new Date()
        }
      })
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/partnership', requireAuth, async (req, res, next) => {
  try {
    const partnerships = await prisma.partnership.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        partnerId: true,
        createdAt: true
      }
    });

    return res.status(200).json({ partnerships });
  } catch (error) {
    return next(error);
  }
});

export default router;
