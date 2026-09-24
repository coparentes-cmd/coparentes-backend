import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

const keysBodySchema = z.object({
  publicKey: z.string().min(1),
  privateKeyEnvelope: z.string().min(1).max(4000)
});

/**
 * X25519 public key in standard base64:
 * - alphabet A–Z a–z 0–9 + / with optional = padding
 * - encoded length multiple of 4
 * - decoded payload exactly 32 bytes
 * (Node Buffer.from(..., 'base64') does not throw on garbage — length/format checks are required.)
 */
function isValidX25519PublicKeyBase64(value) {
  const str = String(value);
  if (!/^[A-Za-z0-9+/]+=*$/.test(str) || str.length % 4 !== 0) {
    return false;
  }
  try {
    const buf = Buffer.from(str, 'base64');
    return buf.length === 32;
  } catch {
    return false;
  }
}

/**
 * POST /api/user/keys
 * Upload / replace the current user's X25519 public key + opaque private-key envelope (E2E).
 * Backend never interprets privateKeyEnvelope internals.
 */
router.post('/keys', requireAuth, async (req, res, next) => {
  try {
    const data = keysBodySchema.parse(req.body);

    if (!isValidX25519PublicKeyBase64(data.publicKey)) {
      return res.status(400).json({ error: 'invalid_public_key' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { publicKey: true, privateKeyEnvelope: true }
    });

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
 * Return the authenticated user's own publicKey + privateKeyEnvelope.
 * This is the ONLY endpoint that ever returns privateKeyEnvelope.
 */
router.get('/keys/mine', requireAuth, async (req, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { publicKey: true, privateKeyEnvelope: true }
    });

    return res.status(200).json({
      publicKey: me?.publicKey ?? null,
      privateKeyEnvelope: me?.privateKeyEnvelope ?? null
    });
  } catch (error) {
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
