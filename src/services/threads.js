import { prisma } from '../lib/prisma.js';
import { createIntegrityHash } from '../utils/security.js';
import { serializeThread } from './serializers.js';

export async function listThreads(workspaceId) {
  const threads = await prisma.thread.findMany({
    where: { workspaceId },
    orderBy: { lastActivity: 'desc' },
    include: {
      messages: { orderBy: { sentAt: 'asc' } }
    }
  });

  return threads.map((thread) => serializeThread(thread, thread.messages));
}

export async function getThreadById(workspaceId, threadId) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, workspaceId },
    include: {
      messages: { orderBy: { sentAt: 'asc' } }
    }
  });

  if (!thread) {
    return null;
  }

  return serializeThread(thread, thread.messages);
}

export async function createThread({
  workspaceId,
  createdBy,
  subject,
  category,
  childId
}) {
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
      lastActivity: new Date()
    }
  });

  return getThreadById(workspaceId, thread.id);
}

export async function addMessageToThread({
  workspaceId,
  threadId,
  sender,
  content,
  tone = 'neutral'
}) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, workspaceId }
  });

  if (!thread) {
    return null;
  }

  const sentAt = new Date();
  const senderName = sender.name.split(' ')[0] || sender.name;
  const payload = {
    threadId: thread.id,
    senderId: sender.id,
    content,
    sentAt: sentAt.toISOString()
  };

  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: thread.id,
        workspaceId,
        senderId: sender.id,
        senderName,
        content,
        tone,
        sentAt,
        isDelivered: true,
        isRead: false,
        hash: createIntegrityHash(payload)
      }
    }),
    prisma.thread.update({
      where: { id: thread.id },
      data: { lastActivity: sentAt }
    })
  ]);

  return getThreadById(workspaceId, thread.id);
}
