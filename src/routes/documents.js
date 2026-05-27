import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireParentRole } from '../middleware/rbac.js';
import {
  createDocument,
  getDocumentDownload,
  isAllowedDocumentCategory,
  listDocuments
} from '../services/documents.js';

const router = express.Router();

const MAX_DOCUMENT_BYTES = 512 * 1024;

function decodedBase64ByteLength(base64) {
  const normalized = base64.replace(/\s/g, '');
  const padding = (normalized.match(/=+$/) || [''])[0].length;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const documents = await listDocuments(req.user.workspaceId);
    return res.json({ documents });
  } catch (error) {
    return next(error);
  }
});

router.get('/:documentId/download', async (req, res, next) => {
  try {
    const payload = await getDocumentDownload(
      req.user.workspaceId,
      req.params.documentId
    );

    if (!payload) {
      return res.status(404).json({ error: 'document_not_found' });
    }

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().trim().min(1).max(200),
      category: z.string().trim().min(1).max(50),
      childId: z.string().nullable().optional(),
      fileName: z.string().trim().min(1).max(255).nullable().optional(),
      mimeType: z.string().trim().min(1).max(120).nullable().optional(),
      fileUrl: z.string().url().nullable().optional(),
      contentBase64: z.string().max(900_000).nullable().optional()
    });
    const data = schema.parse(req.body);

    if (!isAllowedDocumentCategory(data.category)) {
      return res.status(400).json({ error: 'invalid_document_category' });
    }

    if (!data.fileUrl && !data.contentBase64) {
      return res.status(400).json({ error: 'file_required' });
    }

    if (data.contentBase64) {
      const byteLength = decodedBase64ByteLength(data.contentBase64);
      if (byteLength > MAX_DOCUMENT_BYTES) {
        return res.status(413).json({ error: 'file_too_large' });
      }
    }

    const document = await createDocument({
      workspaceId: req.user.workspaceId,
      uploadedById: req.user.id,
      ...data
    });

    return res.status(201).json(document);
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

export default router;
