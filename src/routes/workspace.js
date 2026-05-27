import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { createChild, getWorkspaceGraph } from '../services/workspace.js';

const router = express.Router();

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
    const dateOfBirth = new Date(data.dateOfBirth);

    if (Number.isNaN(dateOfBirth.getTime())) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    if (dateOfBirth > new Date()) {
      return res.status(400).json({ error: 'invalid_date_of_birth' });
    }

    const child = await createChild({
      workspaceId: req.user.workspaceId,
      name: data.name,
      dateOfBirth: data.dateOfBirth,
      school: data.school ?? null
    });

    return res.status(201).json(child);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
