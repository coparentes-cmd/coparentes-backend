import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireParentRole, requireParentOrChildMessage } from '../middleware/rbac.js';
import {
  addMessageToThread,
  createThread,
  getMessageAttachmentDownload,
  getOrCreateCategoryThread,
  getOrCreateFamilyThread,
  getThreadById,
  listThreads,
  markThreadAsRead
} from '../services/threads.js';
import {
  listMessageTagsForUser,
  setMessageTagsForUser
} from '../services/messageTags.js';

const router = express.Router();

router.use(requireAuth);

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
    const messageTags = await setMessageTagsForUser({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      messageId: req.params.messageId,
      tags: data.tags
    });
    return res.json({ messageTags });
  } catch (error) {
    if (error?.code === 'message_not_found') {
      return res.status(404).json({ error: 'message_not_found' });
    }
    if (error?.name === 'ZodError') {
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
        'Wszystkie',
        'Szkoła',
        'Zdrowie',
        'Finanse',
        'Zmiana grafiku',
        'Rodzina'
      ])
    });
    const data = schema.parse(req.body);

    const thread =
      data.category === 'Rodzina'
        ? await getOrCreateFamilyThread({
            workspaceId: req.user.workspaceId,
            createdById: req.user.id
          })
        : await getOrCreateCategoryThread({
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

const attachmentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(262144),
  contentBase64: z.string().min(1).max(400_000)
});

router.get(
  '/:threadId/messages/:messageId/attachments/:attachmentId',
  async (req, res, next) => {
    try {
      const attachment = await getMessageAttachmentDownload({
        workspaceId: req.user.workspaceId,
        threadId: req.params.threadId,
        messageId: req.params.messageId,
        attachmentId: req.params.attachmentId,
        userRole: req.user.role
      });

      if (!attachment) {
        return res.status(404).json({ error: 'attachment_not_found' });
      }

      return res.json(attachment);
    } catch (error) {
      return next(error);
    }
  }
);

router.post('/:threadId/messages', requireParentOrChildMessage, async (req, res, next) => {
  try {
    const schema = z.object({
      content: z.string().max(4000),
      tone: z.enum(['neutral', 'tense', 'aggressive', 'positive']).optional(),
      attachments: z.array(attachmentSchema).max(3).optional()
    });
    const data = schema.parse(req.body);

    if (!data.content.trim() && (data.attachments?.length ?? 0) === 0) {
      return res.status(400).json({ error: 'message_empty' });
    }

    const thread = await addMessageToThread({
      workspaceId: req.user.workspaceId,
      threadId: req.params.threadId,
      sender: req.user,
      content: data.content,
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
      req.user.id,
      req.user.role
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
      userId: req.user.id,
      userRole: req.user.role
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
