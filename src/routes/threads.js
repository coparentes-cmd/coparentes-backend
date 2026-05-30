import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireParentRole } from '../middleware/rbac.js';
import {
  addMessageToThread,
  createThread,
  getOrCreateCategoryThread,
  getThreadById,
  listThreads,
  markThreadAsRead
} from '../services/threads.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const threads = await listThreads(req.user.workspaceId, req.user.id);
    return res.json({ threads });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      subject: z.string().min(3),
      category: z.string().min(2),
      childId: z.string().nullable().optional()
    });
    const data = schema.parse(req.body);

    const thread = await createThread({
      workspaceId: req.user.workspaceId,
      createdBy: req.user,
      subject: data.subject,
      category: data.category,
      childId: data.childId
    });

    return res.status(201).json(thread);
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

router.post('/channel', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      category: z.enum([
        'Szkoła',
        'Zdrowie',
        'Finansowe',
        'Zmiana grafiku',
        'Inne'
      ])
    });
    const data = schema.parse(req.body);

    const thread = await getOrCreateCategoryThread({
      workspaceId: req.user.workspaceId,
      createdBy: req.user,
      category: data.category
    });

    return res.json(thread);
  } catch (error) {
    if (error?.code === 'invalid_category') {
      return res.status(400).json({ error: 'invalid_category' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

// Bardziej specyficzna ścieżka przed /:threadId (Flutter: sendMessage)
router.post('/:threadId/messages', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      content: z.string().min(1).max(4000),
      tone: z.enum(['neutral', 'tense', 'aggressive', 'positive']).optional()
    });
    const data = schema.parse(req.body);

    const thread = await addMessageToThread({
      workspaceId: req.user.workspaceId,
      threadId: req.params.threadId,
      sender: req.user,
      content: data.content,
      tone: data.tone ?? 'neutral'
    });

    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' });
    }

    return res.status(201).json(thread);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.get('/:threadId', async (req, res, next) => {
  try {
    const thread = await getThreadById(
      req.user.workspaceId,
      req.params.threadId,
      req.user.id
    );
    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' });
    }
    return res.json(thread);
  } catch (error) {
    return next(error);
  }
});

router.post('/:threadId/read', async (req, res, next) => {
  try {
    const thread = await markThreadAsRead({
      workspaceId: req.user.workspaceId,
      threadId: req.params.threadId,
      userId: req.user.id
    });

    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' });
    }

    return res.json(thread);
  } catch (error) {
    return next(error);
  }
});

export default router;
