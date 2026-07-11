import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireNonChildRole, requireParentRole } from '../middleware/rbac.js';
import {
  createExportJob,
  getExportDownload,
  listExportJobs
} from '../services/exports.js';

const router = express.Router();

router.use(requireAuth);

// Specific path before any future /:id routes (Flutter: downloadExport)
router.get('/:exportId/download', requireNonChildRole, async (req, res, next) => {
  try {
    const payload = await getExportDownload(
      req.user.workspaceId,
      req.params.exportId
    );

    if (!payload) {
      return res.status(404).json({ error: 'export_not_found' });
    }

    if (payload.expired) {
      return res.status(410).json({ error: 'export_expired' });
    }

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get('/', requireNonChildRole, async (req, res, next) => {
  try {
    const jobs = await listExportJobs(req.user.workspaceId);
    return res.json({ jobs });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      type: z.enum(['messages', 'calendar', 'finances', 'fullPack']),
      fromDate: z.string(),
      toDate: z.string(),
      threadId: z.string().nullable().optional()
    });
    const data = schema.parse(req.body);

    const job = await createExportJob({
      workspaceId: req.user.workspaceId,
      requestedById: req.user.id,
      type: data.type,
      fromDate: data.fromDate,
      toDate: data.toDate,
      threadId: data.threadId
    });

    return res.status(201).json(job);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
