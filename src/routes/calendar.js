import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireParentRole } from '../middleware/rbac.js';
import {
  createCalendarEvent,
  createSwapRequest,
  getCalendarSnapshot,
  respondToSwapRequest
} from '../services/calendar.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const snapshot = await getCalendarSnapshot(req.user.workspaceId);
    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});

router.post('/events', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().max(2000).nullable().optional(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime().nullable().optional(),
      type: z.enum(['school', 'medical', 'activity', 'handover', 'holiday', 'other']),
      childId: z.string().nullable().optional(),
      location: z.string().max(500).nullable().optional()
    });
    const data = schema.parse(req.body);

    const event = await createCalendarEvent({
      workspaceId: req.user.workspaceId,
      createdBy: req.user,
      ...data
    });

    return res.status(201).json(event);
  } catch (error) {
    if (error?.code === 'child_not_found') {
      return res.status(400).json({ error: 'child_not_found' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/swaps', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      originalDate: z.string().datetime(),
      proposedDate: z.string().datetime(),
      reason: z.string().max(1000).nullable().optional()
    });
    const data = schema.parse(req.body);

    const swap = await createSwapRequest({
      workspaceId: req.user.workspaceId,
      requester: req.user,
      ...data
    });

    return res.status(201).json(swap);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/swaps/:swapId/respond', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['pending', 'accepted', 'rejected', 'counterProposed']),
      responseNote: z.string().max(1000).nullable().optional()
    });
    const data = schema.parse(req.body);

    const swap = await respondToSwapRequest({
      workspaceId: req.user.workspaceId,
      swapId: req.params.swapId,
      status: data.status,
      responseNote: data.responseNote,
      responder: req.user
    });

    if (!swap) {
      return res.status(404).json({ error: 'swap_not_found' });
    }

    return res.json(swap);
  } catch (error) {
    if (error?.code === 'swap_not_allowed') {
      return res.status(403).json({ error: 'swap_not_allowed' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
