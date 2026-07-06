import { prisma } from '../lib/prisma.js';

const MAX_TAGS_PER_MESSAGE = 10;
const MAX_TAG_LENGTH = 40;

function normalizeTag(tag) {
  return String(tag ?? '')
    .trim()
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);
}

export async function listMessageTagsForUser({ workspaceId, userId }) {
  const rows = await prisma.messageUserTag.findMany({
    where: { workspaceId, userId },
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
  const message = await prisma.message.findFirst({
    where: { id: messageId, workspaceId },
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
      where: { userId, messageId }
    }),
    ...(normalized.length > 0
      ? [
          prisma.messageUserTag.createMany({
            data: normalized.map((tag) => ({
              workspaceId,
              userId,
              messageId,
              threadId: message.threadId,
              tag
            }))
          })
        ]
      : [])
  ]);

  return listMessageTagsForUser({ workspaceId, userId });
}
