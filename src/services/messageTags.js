import { prisma } from '../lib/prisma.js';
import { requireEntityId } from '../utils/ids.js';

const MAX_TAGS_PER_MESSAGE = 10;
const MAX_TAG_LENGTH = 40;

function normalizeTag(tag) {
  return String(tag ?? '')
    .trim()
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);
}

export async function listMessageTagsForUser({ workspaceId, userId }) {
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');
  const safeUserId = requireEntityId(userId, 'userId');
  const rows = await prisma.messageUserTag.findMany({
    where: { workspaceId: safeWorkspaceId, userId: safeUserId },
    orderBy: { createdAt: 'asc' },
    select: {
      messageId: true,
      threadId: true,
      tag: true
    }
  });

  return rows.map((row) => ({
    messageId: row.messageId,
    threadId: row.threadId,
    tag: row.tag
  }));
}

export async function setMessageTagsForUser({
  workspaceId,
  userId,
  messageId,
  tags
}) {
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');
  const safeUserId = requireEntityId(userId, 'userId');
  const safeMessageId = requireEntityId(messageId, 'messageId');

  const message = await prisma.message.findFirst({
    where: { id: safeMessageId, workspaceId: safeWorkspaceId },
    select: { id: true, threadId: true }
  });

  if (!message) {
    const error = new Error('message_not_found');
    error.code = 'message_not_found';
    throw error;
  }

  const normalized = [
    ...new Set(
      (tags ?? [])
        .map(normalizeTag)
        .filter((tag) => tag.length > 0)
    )
  ].slice(0, MAX_TAGS_PER_MESSAGE);

  await prisma.$transaction([
    prisma.messageUserTag.deleteMany({
      where: { userId: safeUserId, messageId: safeMessageId }
    }),
    ...(normalized.length > 0
      ? [
          prisma.messageUserTag.createMany({
            data: normalized.map((tag) => ({
              workspaceId: safeWorkspaceId,
              userId: safeUserId,
              messageId: safeMessageId,
              threadId: message.threadId,
              tag
            }))
          })
        ]
      : [])
  ]);

  return listMessageTagsForUser({
    workspaceId: safeWorkspaceId,
    userId: safeUserId
  });
}
