import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireParentRole, requireParentOrChildMessage } from '../middleware/rbac.js';
import {
  addMessageToThread,
  createThread,
  getMessageAttachmentDownload,
  getMyThreadKey,
  getOrCreateCategoryThread,
  getOrCreateFamilyThread,
  getThreadById,
  listThreads,
  markThreadAsRead,
  syncFamilyThreadKey
} from '../services/threads.js';
import {
  listMessageTagsForUser,
  setMessageTagsForUser
} from '../services/messageTags.js';
import { entityIdSchema, optionalEntityIdSchema, parseEntityId } from '../utils/ids.js';

const router = express.Router();

router.use(requireAuth);

const threadKeyEntrySchema = z.object({
  userId: z.string().min(1),
  encryptedKey: z.string().min(1).max(500)
});

router.get('/', async (req, res, next) => {
  try {
    const [threads, messageTags] = await Promise.all([
      listThreads(req.user.workspaceId, req.user.id, req.user.role),
      listMessageTagsForUser({
        workspaceId: req.user.workspaceId,
        userId: req.user.id
      })
    ]);
    return res.json({ threads, messageTags });
  } catch (error) {
    return next(error);
  }
});

router.put('/messages/:messageId/tags', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      tags: z.array(z.string().min(1).max(40)).max(10)
    });
    const data = schema.parse(req.body);
    const messageId = parseEntityId(req.params.messageId, 'messageId');
    const messageTags = await setMessageTagsForUser({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      messageId,
      tags: data.tags
    });
    return res.json({ messageTags });
  } catch (error) {
    if (error?.code === 'message_not_found') {
      return res.status(404).json({ error: 'message_not_found' });
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
      subject: z.string().min(3),
      category: z.string().min(2),
      childId: optionalEntityIdSchema,
      threadKeys: z.array(threadKeyEntrySchema).min(1)
    });
    const data = schema.parse(req.body);

    const thread = await createThread({
      workspaceId: req.user.workspaceId,
      createdBy: req.user,
      subject: data.subject,
      category: data.category,
      childId: data.childId,
      threadKeys: data.threadKeys
    });

    return res.status(201).json(thread);
  } catch (error) {
    if (error?.code === 'child_not_found') {
      return res.status(400).json({ error: 'child_not_found' });
    }
    if (error?.code === 'invalid_thread_keys') {
      return res.status(400).json({ error: 'invalid_thread_keys' });
    }
    if (error?.code === 'thread_keys_required') {
      return res.status(400).json({ error: 'thread_keys_required' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/channel', requireParentRole, async (req, res, next) => {
  try {
    const schema = z
      .object({
        category: z.enum([
          'Wszystkie',
          'Szkoła',
          'Zdrowie',
          'Finanse',
          'Zmiana grafiku',
          'Rodzina'
        ]),
        threadKeys: z.array(threadKeyEntrySchema).min(1).optional()
      })
      .superRefine((data, ctx) => {
        if (data.category === 'Zmiana grafiku') {
          return;
        }
        if (!data.threadKeys?.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'thread_keys_required',
            path: ['threadKeys']
          });
        }
      });
    const data = schema.parse(req.body);

    const thread =
      data.category === 'Rodzina'
        ? await getOrCreateFamilyThread({
            workspaceId: req.user.workspaceId,
            createdById: req.user.id,
            threadKeys: data.threadKeys
          })
        : await getOrCreateCategoryThread({
            workspaceId: req.user.workspaceId,
            createdBy: req.user,
            category: data.category,
            threadKeys: data.threadKeys ?? null
          });

    return res.json(thread);
  } catch (error) {
    if (error?.code === 'invalid_category') {
      return res.status(400).json({ error: 'invalid_category' });
    }
    if (error?.code === 'invalid_thread_keys') {
      return res.status(400).json({ error: 'invalid_thread_keys' });
    }
    if (error?.code === 'thread_keys_required') {
      return res.status(400).json({ error: 'thread_keys_required' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

const attachmentSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(262144),
  contentBase64: z.string().min(1).max(400_000)
});

router.get(
  '/:threadId/messages/:messageId/attachments/:attachmentId',
  async (req, res, next) => {
    try {
      const threadId = parseEntityId(req.params.threadId, 'threadId');
      const messageId = parseEntityId(req.params.messageId, 'messageId');
      const attachmentId = parseEntityId(req.params.attachmentId, 'attachmentId');
      const attachment = await getMessageAttachmentDownload({
        workspaceId: req.user.workspaceId,
        threadId,
        messageId,
        attachmentId,
        userRole: req.user.role
      });

      if (!attachment) {
        return res.status(404).json({ error: 'attachment_not_found' });
      }

      return res.json(attachment);
    } catch (error) {
      if (error?.name === 'ZodError' || error?.code === 'invalid_id') {
        return res.status(400).json({ error: 'invalid_request' });
      }
      return next(error);
    }
  }
);

router.post('/:threadId/messages', requireParentOrChildMessage, async (req, res, next) => {
  try {
    const schema = z.object({
      ciphertext: z.string().min(1).max(8000),
      nonce: z.string().min(1),
      tone: z.enum(['neutral', 'tense', 'aggressive', 'positive']).optional(),
      attachments: z.array(attachmentSchema).max(3).optional()
    });
    const data = schema.parse(req.body);
    const threadId = parseEntityId(req.params.threadId, 'threadId');

    const thread = await addMessageToThread({
      workspaceId: req.user.workspaceId,
      threadId,
      sender: req.user,
      ciphertext: data.ciphertext,
      nonce: data.nonce,
      tone: data.tone ?? 'neutral',
      attachments: data.attachments ?? []
    });

    if (!thread) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.status(201).json(thread);
  } catch (error) {
    if (error?.code === 'message_empty') {
      return res.status(400).json({ error: 'message_empty' });
    }
    if (error?.code === 'attachment_too_large') {
      return res.status(413).json({ error: 'attachment_too_large' });
    }
    if (error?.code === 'too_many_attachments' || error?.code === 'invalid_attachment') {
      return res.status(400).json({ error: error.code });
    }
    if (error?.name === 'ZodError' || error?.code === 'invalid_id') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.get('/:threadId/keys/mine', async (req, res, next) => {
  try {
    const threadId = parseEntityId(req.params.threadId, 'threadId');
    const result = await getMyThreadKey({
      workspaceId: req.user.workspaceId,
      threadId,
      user: req.user
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({ encryptedKey: result.encryptedKey });
  } catch (error) {
    if (error?.name === 'ZodError' || error?.code === 'invalid_id') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post(
  '/:threadId/keys/family-sync',
  requireParentRole,
  async (req, res, next) => {
    try {
      const schema = z.object({
        userId: z.string().min(1),
        encryptedKey: z.string().min(1).max(500)
      });
      const data = schema.parse(req.body);
      const threadId = parseEntityId(req.params.threadId, 'threadId');

      const result = await syncFamilyThreadKey({
        workspaceId: req.user.workspaceId,
        threadId,
        userId: data.userId,
        encryptedKey: data.encryptedKey
      });

      if (result.error) {
        return res.status(result.status).json({ error: result.error });
      }

      return res.status(201).json(result.threadKey);
    } catch (error) {
      if (error?.name === 'ZodError' || error?.code === 'invalid_id') {
        return res.status(400).json({ error: 'invalid_request' });
      }
      return next(error);
    }
  }
);

router.get('/:threadId', async (req, res, next) => {
  try {
    const threadId = parseEntityId(req.params.threadId, 'threadId');
    const thread = await getThreadById(
      req.user.workspaceId,
      threadId,
      req.user.id,
      req.user.role
    );
    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' });
    }
    return res.json(thread);
  } catch (error) {
    if (error?.name === 'ZodError' || error?.code === 'invalid_id') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/:threadId/read', async (req, res, next) => {
  try {
    const threadId = parseEntityId(req.params.threadId, 'threadId');
    const thread = await markThreadAsRead({
      workspaceId: req.user.workspaceId,
      threadId,
      userId: req.user.id,
      userRole: req.user.role
    });

    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' });
    }

    return res.json(thread);
  } catch (error) {
    if (error?.name === 'ZodError' || error?.code === 'invalid_id') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
