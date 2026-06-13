import { prisma } from '../lib/prisma.js';
import { createIntegrityHash } from '../utils/security.js';
import { serializeThread } from './serializers.js';
import {
  normalizeAttachments,
  parseStoredAttachments,
  serializeAttachmentsForClient
} from './messageAttachments.js';

export const CATEGORY_CHANNELS = [
  'Szkoła',
  'Zdrowie',
  'Finansowe',
  'Zmiana grafiku',
  'Inne'
];

export const FAMILY_CATEGORY = 'Rodzina';

function threadWhereForRole(userRole) {
  if (userRole === 'child') {
    return { audience: 'family' };
  }
  return {};
}

export function canUserAccessThread(userRole, thread) {
  if (!thread) {
    return false;
  }
  if (userRole === 'child') {
    return thread.audience === 'family';
  }
  return true;
}

export function canUserSendMessage(userRole, thread) {
  if (!canUserAccessThread(userRole, thread)) {
    return false;
  }
  if (userRole === 'child') {
    return thread.audience === 'family';
  }
  return userRole === 'parentA' || userRole === 'parentB';
}

export async function listThreads(workspaceId, viewerUserId, userRole = 'parentA') {
  if (userRole === 'parentA' || userRole === 'parentB' || userRole === 'child') {
    await getOrCreateFamilyThread({ workspaceId, createdById: viewerUserId });
  }

  const threads = await prisma.thread.findMany({
    where: {
      workspaceId,
      ...threadWhereForRole(userRole)
    },
    orderBy: { lastActivity: 'desc' },
    include: {
      messages: { orderBy: { sentAt: 'asc' } }
    }
  });

  return threads.map((thread) =>
    serializeThread(thread, thread.messages, viewerUserId)
  );
}

export async function getThreadById(
  workspaceId,
  threadId,
  viewerUserId,
  userRole = 'parentA'
) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, workspaceId },
    include: {
      messages: { orderBy: { sentAt: 'asc' } }
    }
  });

  if (!thread || !canUserAccessThread(userRole, thread)) {
    return null;
  }

  return serializeThread(thread, thread.messages, viewerUserId);
}

export async function getOrCreateFamilyThread({ workspaceId, createdById }) {
  const existing = await prisma.thread.findFirst({
    where: {
      workspaceId,
      category: FAMILY_CATEGORY,
      subject: FAMILY_CATEGORY,
      audience: 'family'
    },
    orderBy: { createdAt: 'asc' }
  });

  if (existing) {
    return getThreadById(workspaceId, existing.id, createdById, 'parentA');
  }

  const thread = await prisma.thread.create({
    data: {
      workspaceId,
      subject: FAMILY_CATEGORY,
      category: FAMILY_CATEGORY,
      childId: null,
      createdById,
      audience: 'family',
      lastActivity: new Date()
    }
  });

  return getThreadById(workspaceId, thread.id, createdById, 'parentA');
}

export async function createThread({
  workspaceId,
  createdBy,
  subject,
  category,
  childId
}) {
  if (subject === category && category === FAMILY_CATEGORY) {
    return getOrCreateFamilyThread({
      workspaceId,
      createdById: createdBy.id
    });
  }

  if (subject === category && CATEGORY_CHANNELS.includes(category)) {
    return getOrCreateCategoryThread({ workspaceId, createdBy, category });
  }

  if (childId) {
    const child = await prisma.child.findFirst({
      where: { id: childId, workspaceId }
    });
    if (!child) {
      const error = new Error('child_not_found');
      error.code = 'child_not_found';
      throw error;
    }
  }

  const thread = await prisma.thread.create({
    data: {
      workspaceId,
      subject,
      category,
      childId: childId ?? null,
      createdById: createdBy.id,
      audience: 'parents',
      lastActivity: new Date()
    }
  });

  return getThreadById(workspaceId, thread.id, createdBy.id, createdBy.role);
}

export async function getOrCreateCategoryThread({
  workspaceId,
  createdBy,
  category
}) {
  if (!CATEGORY_CHANNELS.includes(category)) {
    const error = new Error('invalid_category');
    error.code = 'invalid_category';
    throw error;
  }

  const existing = await prisma.thread.findFirst({
    where: { workspaceId, category, subject: category, audience: 'parents' },
    orderBy: { createdAt: 'asc' }
  });

  if (existing) {
    return getThreadById(workspaceId, existing.id, createdBy.id, createdBy.role);
  }

  const thread = await prisma.thread.create({
    data: {
      workspaceId,
      subject: category,
      category,
      childId: null,
      createdById: createdBy.id,
      audience: 'parents',
      lastActivity: new Date()
    }
  });

  return getThreadById(workspaceId, thread.id, createdBy.id, createdBy.role);
}

export async function markThreadAsRead({
  workspaceId,
  threadId,
  userId,
  userRole = 'parentA'
}) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, workspaceId }
  });

  if (!thread || !canUserAccessThread(userRole, thread)) {
    return null;
  }

  await prisma.message.updateMany({
    where: {
      threadId,
      workspaceId,
      senderId: { not: userId },
      isRead: false
    },
    data: { isRead: true }
  });

  return getThreadById(workspaceId, threadId, userId, userRole);
}

export async function addMessageToThread({
  workspaceId,
  threadId,
  sender,
  content,
  tone = 'neutral',
  attachments = []
}) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, workspaceId }
  });

  if (!thread || !canUserSendMessage(sender.role, thread)) {
    return null;
  }

  const normalizedAttachments = normalizeAttachments(attachments);
  const trimmedContent = content.trim();
  if (!trimmedContent && normalizedAttachments.length === 0) {
    const error = new Error('message_empty');
    error.code = 'message_empty';
    throw error;
  }

  const sentAt = new Date();
  const senderName = sender.name.split(' ')[0] || sender.name;
  const payload = {
    threadId: thread.id,
    senderId: sender.id,
    content: trimmedContent,
    sentAt: sentAt.toISOString(),
    attachmentIds: normalizedAttachments.map((item) => item.id)
  };

  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: thread.id,
        workspaceId,
        senderId: sender.id,
        senderName,
        content: trimmedContent,
        tone,
        sentAt,
        isDelivered: true,
        isRead: false,
        hash: createIntegrityHash(payload),
        attachmentsJson:
          normalizedAttachments.length > 0
            ? JSON.stringify(normalizedAttachments)
            : null
      }
    }),
    prisma.thread.update({
      where: { id: thread.id },
      data: { lastActivity: sentAt }
    })
  ]);

  return getThreadById(workspaceId, thread.id, sender.id, sender.role);
}

export async function getMessageAttachmentDownload({
  workspaceId,
  threadId,
  messageId,
  attachmentId,
  userRole = 'parentA'
}) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, workspaceId }
  });

  if (!thread || !canUserAccessThread(userRole, thread)) {
    return null;
  }

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      threadId,
      workspaceId
    }
  });

  if (!message) {
    return null;
  }

  const attachments = parseStoredAttachments(message.attachmentsJson);
  const attachment = attachments.find((item) => item.id === attachmentId);
  if (!attachment?.contentBase64) {
    return null;
  }

  return serializeAttachmentsForClient([attachment], { includeContent: true })[0];
}
