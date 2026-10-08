import express from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireParentRole } from '../middleware/rbac.js';
import {
  createChild,
  deleteChild,
  getWorkspaceGraph,
  updateChild,
  updateWorkspaceName
} from '../services/workspace.js';
import { requestChildPasswordReset } from '../services/authService.js';
import { prisma } from '../lib/prisma.js';
import { entityIdSchema } from '../utils/ids.js';
import { isDateOfBirthInFuture, normalizeDateOfBirth } from '../utils/dateOfBirth.js';

const router = express.Router();

const RATE_LIMIT_MESSAGE = { error: 'Too many requests, try again later' };

// WARNING: express-rate-limit MemoryStore — per-process only (same as user.js).
const childPasswordResetLimiterStore = new MemoryStore();
/**
 * Parent-triggered child login-password reset (sends e-mail to parents).
 * 5 / 15 min per authenticated parent userId.
 */
const childPasswordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  keyGenerator: (req) =>
    `workspace-child-password-reset:${req.user?.id || 'unknown'}`,
  store: childPasswordResetLimiterStore
});

/** Clears workspace-route rate-limit MemoryStores (for tests only). */
export async function resetWorkspaceRateLimitersForTests() {
  await childPasswordResetLimiterStore.resetAll();
}

const childUserIdParamSchema = z.object({
  childUserId: entityIdSchema
});

router.get('/current', requireAuth, async (req, res, next) => {
  try {
    const workspace = await getWorkspaceGraph(req.user.workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'workspace_not_found' });
    }
    return res.json(workspace);
  } catch (error) {
    return next(error);
  }
});

router.post('/children', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'parentA') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const schema = z.object({
      name: z.string().trim().min(2).max(120),
      dateOfBirth: z.string().datetime(),
      school: z.string().trim().min(1).max(200).nullable().optional()
    });
    const data = schema.parse(req.body);
    if (!normalizeDateOfBirth(data.dateOfBirth)) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    if (isDateOfBirthInFuture(data.dateOfBirth)) {
      return res.status(400).json({ error: 'invalid_date_of_birth' });
    }

    const child = await createChild({
      workspaceId: req.user.workspaceId,
      name: data.name,
      dateOfBirth: data.dateOfBirth,
      school: data.school ?? null
    });

    if (child?.error) {
      return res.status(child.status).json({ error: child.error });
    }

    return res.status(201).json(child);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.patch('/children/:childId', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'parentA' && req.user.role !== 'parentB') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const { childId } = z.object({ childId: entityIdSchema }).parse(req.params);
    const schema = z.object({
      name: z.string().trim().min(2).max(120).optional(),
      dateOfBirth: z.string().datetime().optional(),
      school: z.string().trim().min(1).max(200).nullable().optional()
    });
    const data = schema.parse(req.body);

    if (data.dateOfBirth) {
      if (
        !normalizeDateOfBirth(data.dateOfBirth) ||
        isDateOfBirthInFuture(data.dateOfBirth)
      ) {
        return res.status(400).json({ error: 'invalid_date_of_birth' });
      }
    }

    const result = await updateChild({
      workspaceId: req.user.workspaceId,
      childId,
      name: data.name,
      dateOfBirth: data.dateOfBirth,
      school: data.school
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json(result.child);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.delete('/children/:childId', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'parentA') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const { childId } = z.object({ childId: entityIdSchema }).parse(req.params);
    const result = await deleteChild({
      workspaceId: req.user.workspaceId,
      childId
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(204).send();
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.patch('/current', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'parentA' && req.user.role !== 'parentB') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const data = z
      .object({ name: z.string().trim().min(2).max(120) })
      .parse(req.body);

    const result = await updateWorkspaceName({
      workspaceId: req.user.workspaceId,
      name: data.name
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json(result.workspace);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

/**
 * POST /api/workspace/children/:childUserId/reset-password
 * ParentA/parentB: send a login-password reset link for a child account in
 * this workspace. E-mail goes to both parents (not the synthetic child address).
 *
 * Rate limit: 5 / 15 min per parent userId.
 */
router.post(
  '/children/:childUserId/reset-password',
  requireAuth,
  requireParentRole,
  childPasswordResetLimiter,
  async (req, res, next) => {
    try {
      const { childUserId } = childUserIdParamSchema.parse(req.params);
      const workspaceId = req.user.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      // Defense in depth: child must already belong to caller's workspace
      // before we even hit the service (service also filters by workspaceId).
      const inWorkspace = await prisma.user.findFirst({
        where: {
          id: childUserId,
          workspaceId,
          role: 'child',
          deletedAt: null
        },
        select: { id: true }
      });
      if (!inWorkspace) {
        return res.status(404).json({ error: 'child_not_found' });
      }

      const result = await requestChildPasswordReset({
        childUserId,
        workspaceId
      });

      if (result.error) {
        return res.status(result.status || 400).json({
          error: result.error,
          ...(result.reason ? { reason: result.reason } : {})
        });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      if (error?.name === 'ZodError') {
        return res.status(400).json({ error: 'invalid_request' });
      }
      return next(error);
    }
  }
);

export default router;
