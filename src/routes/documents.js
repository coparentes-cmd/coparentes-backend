import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireNonChildRole, requireParentRole } from '../middleware/rbac.js';
import {
  createDocument,
  deleteDocument,
  getDocumentDownload,
  isAllowedDocumentCategory,
  listDocuments
} from '../services/documents.js';
import { optionalEntityIdSchema, parseEntityId } from '../utils/ids.js';

const router = express.Router();

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

function decodedBase64ByteLength(base64) {
  const normalized = base64.replace(/\s/g, '');
  const padding = (normalized.match(/=+$/) || [''])[0].length;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

router.use(requireAuth);

router.get('/', requireNonChildRole, async (req, res, next) => {
  try {
    const documents = await listDocuments(req.user.workspaceId, req.user.id);
    return res.json({ documents });
  } catch (error) {
    return next(error);
  }
});

router.get('/:documentId/download', requireNonChildRole, async (req, res, next) => {
  try {
    const documentId = parseEntityId(req.params.documentId, 'documentId');
    const payload = await getDocumentDownload(
      req.user.workspaceId,
      documentId,
      req.user.id
    );

    if (!payload) {
      return res.status(404).json({ error: 'document_not_found' });
    }

    return res.json(payload);
  } catch (error) {
    if (error?.name === 'ZodError' || error?.code === 'invalid_id') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.delete('/:documentId', requireNonChildRole, async (req, res, next) => {
  try {
    const documentId = parseEntityId(req.params.documentId, 'documentId');
    const result = await deleteDocument({
      workspaceId: req.user.workspaceId,
      documentId,
      requesterId: req.user.id
    });
    return res.json(result);
  } catch (error) {
    if (error?.code === 'document_not_found') {
      return res.status(404).json({ error: 'document_not_found' });
    }
    if (error?.code === 'forbidden') {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (error?.name === 'ZodError' || error?.code === 'invalid_id') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().trim().min(1).max(200),
      category: z.string().trim().min(1).max(50),
      childId: optionalEntityIdSchema,
      fileName: z.string().trim().min(1).max(255).nullable().optional(),
      mimeType: z.string().trim().min(1).max(120).nullable().optional(),
      // fileUrl intentionally omitted — create accepts contentBase64 only;
      // legacy rows with fileUrl still serialize/read normally.
      contentBase64: z.string().max(7_500_000).nullable().optional()
    });
    const data = schema.parse(req.body);

    if (!isAllowedDocumentCategory(data.category)) {
      return res.status(400).json({ error: 'invalid_document_category' });
    }

    if (!data.contentBase64) {
      return res.status(400).json({ error: 'file_required' });
    }

    const byteLength = decodedBase64ByteLength(data.contentBase64);
    if (byteLength > MAX_DOCUMENT_BYTES) {
      return res.status(413).json({ error: 'file_too_large' });
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
    if (error?.code === 'unsupported_file_type') {
      return res.status(400).json({ error: 'unsupported_file_type' });
    }
    if (error?.code === 'workspace_document_limit_reached') {
      return res.status(413).json({
        error: 'workspace_document_limit_reached',
        message:
          'Osiągnięto limit dokumentów dla tej rodziny (200 plików).'
      });
    }
    if (error?.code === 'workspace_storage_limit_reached') {
      return res.status(413).json({
        error: 'workspace_storage_limit_reached',
        message:
          'Osiągnięto limit miejsca na dokumenty (100 MB). Usuń nieużywane pliki prywatne, aby zwolnić miejsce.'
      });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
