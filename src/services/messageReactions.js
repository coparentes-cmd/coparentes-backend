import { prisma } from '../lib/prisma.js';
import { requireEntityId } from '../utils/ids.js';

/** WhatsApp-style quick reactions (fixed set). */
export const ALLOWED_MESSAGE_REACTIONS = Object.freeze([
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏'
]);

const allowedSet = new Set(ALLOWED_MESSAGE_REACTIONS);

function serializeReaction(row) {
  return {
    messageId: row.messageId,
    threadId: row.threadId,
    userId: row.userId,
    emoji: row.emoji
  };
}

/** True when migration MessageReaction is not applied yet (avoid breaking GET /threads). */
function isMissingReactionTable(error) {
  const code = error?.code;
  if (code === 'P2021' || code === 'P2010') {
    return true;
  }
  const message = String(error?.message ?? '');
  return /messageReaction|MessageReaction/i.test(message) &&
    /(does not exist|unknown|no such table|relation)/i.test(message);
}

function throwReactionsUnavailable() {
  const error = new Error('reactions_unavailable');
  error.code = 'reactions_unavailable';
  throw error;
}

export async function listMessageReactionsForThreads({
  workspaceId,
  threadIds
}) {
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');
  const ids = [...new Set((threadIds ?? []).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }

  try {
    const rows = await prisma.messageReaction.findMany({
      where: {
        workspaceId: safeWorkspaceId,
        threadId: { in: ids }
      },
      orderBy: { createdAt: 'asc' },
      select: {
        messageId: true,
        threadId: true,
        userId: true,
        emoji: true
      }
    });
    return rows.map(serializeReaction);
  } catch (error) {
    if (isMissingReactionTable(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Set or clear the current user's single reaction on a message.
 * Pass emoji=null / empty to clear. Same emoji again → clear (toggle).
 */
export async function setMessageReactionForUser({
  workspaceId,
  userId,
  messageId,
  emoji
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

  const raw = emoji == null ? '' : String(emoji).trim();
  const nextEmoji = raw.length === 0 ? null : raw;

  if (nextEmoji != null && !allowedSet.has(nextEmoji)) {
    const error = new Error('invalid_reaction');
    error.code = 'invalid_reaction';
    throw error;
  }

  try {
    const existing = await prisma.messageReaction.findUnique({
      where: {
        userId_messageId: {
          userId: safeUserId,
          messageId: safeMessageId
        }
      },
      select: { emoji: true }
    });

    if (nextEmoji == null || (existing && existing.emoji === nextEmoji)) {
      await prisma.messageReaction.deleteMany({
        where: { userId: safeUserId, messageId: safeMessageId }
      });
    } else {
      await prisma.messageReaction.upsert({
        where: {
          userId_messageId: {
            userId: safeUserId,
            messageId: safeMessageId
          }
        },
        create: {
          workspaceId: safeWorkspaceId,
          userId: safeUserId,
          messageId: safeMessageId,
          threadId: message.threadId,
          emoji: nextEmoji
        },
        update: {
          emoji: nextEmoji
        }
      });
    }
  } catch (error) {
    if (isMissingReactionTable(error)) {
      throwReactionsUnavailable();
    }
    throw error;
  }

  return listMessageReactionsForThreads({
    workspaceId: safeWorkspaceId,
    threadIds: [message.threadId]
  });
}
