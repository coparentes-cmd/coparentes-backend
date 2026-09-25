import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { deleteOwnAccount } from '../services/authService.js';
import {
  clearSessionCookie
} from '../services/sessionCookie.service.js';

const router = express.Router();

const deleteBodySchema = z.object({
  password: z.string().min(1)
});

/**
 * POST /api/account/delete
 * Soft-delete + anonymize the authenticated user (password confirmation required).
 */
router.post('/delete', requireAuth, async (req, res, next) => {
  try {
    const data = deleteBodySchema.parse(req.body);
    const result = await deleteOwnAccount(req.user.id, data.password);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    clearSessionCookie(res);
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
