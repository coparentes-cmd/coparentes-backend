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
import {
  createCustodyException,
  proposeCustodySchedule,
  respondToCustodyException,
  respondToCustodySchedule,
  updateCustodySlotHandover
} from '../services/custodySchedule.js';

const router = express.Router();

const weekPatternSchema = z.object({
  monday: z.enum(['parentA', 'parentB']),
  tuesday: z.enum(['parentA', 'parentB']),
  wednesday: z.enum(['parentA', 'parentB']),
  thursday: z.enum(['parentA', 'parentB']),
  friday: z.enum(['parentA', 'parentB']),
  saturday: z.enum(['parentA', 'parentB']),
  sunday: z.enum(['parentA', 'parentB'])
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const snapshot = await getCalendarSnapshot(req.user.workspaceId);
    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});

router.post('/schedules', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      patternType: z.enum(['weekAlternating', 'everyOtherWeekend', 'customWeek']),
      startDate: z.string(),
      weekA: weekPatternSchema.optional(),
      weekB: weekPatternSchema.optional(),
      handoverTime: z.string().max(20).nullable().optional(),
      handoverLocation: z.string().max(500).nullable().optional()
    });
    const data = schema.parse(req.body);

    const schedule = await proposeCustodySchedule({
      workspaceId: req.user.workspaceId,
      proposer: req.user,
      ...data
    });

    return res.status(201).json(schedule);
  } catch (error) {
    if (error?.code === 'schedule_not_allowed') {
      return res.status(403).json({ error: 'schedule_not_allowed' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/schedules/:scheduleId/respond', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      approve: z.boolean(),
      responseNote: z.string().max(1000).nullable().optional()
    });
    const data = schema.parse(req.body);

    const schedule = await respondToCustodySchedule({
      workspaceId: req.user.workspaceId,
      scheduleId: req.params.scheduleId,
      responder: req.user,
      approve: data.approve,
      responseNote: data.responseNote
    });

    if (!schedule) {
      return res.status(404).json({ error: 'schedule_not_found' });
    }

    return res.json(schedule);
  } catch (error) {
    if (error?.code === 'schedule_not_allowed') {
      return res.status(403).json({ error: 'schedule_not_allowed' });
    }
    if (error?.code === 'schedule_not_pending') {
      return res.status(409).json({ error: 'schedule_not_pending' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/exceptions', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      fromDate: z.string(),
      toDate: z.string().optional(),
      custodian: z.enum(['parentA', 'parentB']),
      exceptionType: z.enum(['singleDay', 'range', 'holiday']).optional(),
      reason: z.string().max(1000).nullable().optional()
    });
    const data = schema.parse(req.body);

    const exception = await createCustodyException({
      workspaceId: req.user.workspaceId,
      requester: req.user,
      fromDate: data.fromDate,
      toDate: data.toDate ?? data.fromDate,
      custodian: data.custodian,
      exceptionType: data.exceptionType,
      reason: data.reason
    });

    return res.status(201).json(exception);
  } catch (error) {
    if (error?.code === 'exception_not_allowed') {
      return res.status(403).json({ error: 'exception_not_allowed' });
    }
    if (error?.code === 'invalid_date_range') {
      return res.status(400).json({ error: 'invalid_date_range' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/exceptions/:exceptionId/respond', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      approve: z.boolean(),
      responseNote: z.string().max(1000).nullable().optional()
    });
    const data = schema.parse(req.body);

    const exception = await respondToCustodyException({
      workspaceId: req.user.workspaceId,
      exceptionId: req.params.exceptionId,
      responder: req.user,
      approve: data.approve,
      responseNote: data.responseNote
    });

    if (!exception) {
      return res.status(404).json({ error: 'exception_not_found' });
    }

    return res.json(exception);
  } catch (error) {
    if (error?.code === 'exception_not_allowed') {
      return res.status(403).json({ error: 'exception_not_allowed' });
    }
    if (error?.code === 'exception_not_pending') {
      return res.status(409).json({ error: 'exception_not_pending' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.patch('/slots/:slotId', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      handoverTime: z.string().max(20).nullable().optional(),
      handoverLocation: z.string().max(500).nullable().optional()
    });
    const data = schema.parse(req.body);

    const slot = await updateCustodySlotHandover({
      workspaceId: req.user.workspaceId,
      slotId: req.params.slotId,
      handoverTime: data.handoverTime,
      handoverLocation: data.handoverLocation,
      user: req.user
    });

    if (!slot) {
      return res.status(404).json({ error: 'slot_not_found' });
    }

    return res.json(slot);
  } catch (error) {
    if (error?.code === 'slot_not_allowed') {
      return res.status(403).json({ error: 'slot_not_allowed' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
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
