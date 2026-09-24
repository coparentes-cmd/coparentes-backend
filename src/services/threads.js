import { prisma } from '../lib/prisma.js';
import { createIntegrityHash } from '../utils/security.js';
import { requireEntityId } from '../utils/ids.js';
import { CRYPTO_KEYS, decryptOptionalSafe, encryptOptional } from './crypto.service.js';
import { serializeThread } from './serializers.js';
import { listParentUserIds } from './workspace.js';
import {
  normalizeAttachments,
  parseStoredAttachments,
  serializeAttachmentsForClient
} from './messageAttachments.js';

// UWAGA: każda nowa kategoria dodana tutaj domyślnie wymaga E2E threadKeys.
// Jeśli nowa kategoria ma być kanałem systemowym (pisanym tylko przez backend,
// bez E2E - jak SYSTEM_SCHEDULE_CATEGORY), musi zostać jawnie dodana do
// isSystemCategory() poniżej, inaczej automatyczne wiadomości do niej będą
// cicho failować w notifyXxx (błąd łapany w catch, nie widoczny bez sprawdzenia logów).
export const CATEGORY_CHANNELS = [
  'Wszystkie',
  'Szkoła',
  'Zdrowie',
  'Finanse',
  'Zmiana grafiku'
];

export const FAMILY_CATEGORY = 'Rodzina';
/** Non-E2E channel written only by backend schedule/swap notifications. */
export const SYSTEM_SCHEDULE_CATEGORY = 'Zmiana grafiku';

export const MESSAGE_TYPE_USER = 'user';
export const MESSAGE_TYPE_SYSTEM = 'system';

function isSystemCategory(category) {
  return category === SYSTEM_SCHEDULE_CATEGORY;
}

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
  if (thread.isSystemChannel) {
    return false;
  }
  if (userRole === 'child') {
    return thread.audience === 'family';
  }
  return userRole === 'parentA' || userRole === 'parentB';
}

function throwInvalidThreadKeys() {
  const error = new Error('invalid_thread_keys');
  error.code = 'invalid_thread_keys';
  throw error;
}

/**
 * threadKeys must be exactly the current parentA/parentB set in the workspace (1:1).
 */
export async function assertValidParentThreadKeys(workspaceId, threadKeys) {
  if (!Array.isArray(threadKeys) || threadKeys.length === 0) {
    throwInvalidThreadKeys();
  }

  const requiredIds = await listParentUserIds(workspaceId);
  const providedIds = threadKeys.map((entry) => entry.userId);

  if (new Set(providedIds).size !== providedIds.length) {
    throwInvalidThreadKeys();
  }

  if (providedIds.length !== requiredIds.length) {
    throwInvalidThreadKeys();
  }

  const required = new Set(requiredIds);
  for (const userId of providedIds) {
    if (!required.has(userId)) {
      throwInvalidThreadKeys();
    }
  }
}

function throwThreadKeysRequired() {
  const error = new Error('thread_keys_required');
  error.code = 'thread_keys_required';
  throw error;
}

function requireThreadKeys(threadKeys) {
  if (!Array.isArray(threadKeys) || threadKeys.length === 0) {
    throwThreadKeysRequired();
  }
}

async function createThreadKeysInTx(tx, threadId, threadKeys) {
  if (!threadKeys?.length) {
    return;
  }
  await tx.threadKey.createMany({
    data: threadKeys.map((entry) => ({
      threadId,
      userId: entry.userId,
      encryptedKey: entry.encryptedKey
    }))
  });
}

export async function listThreads(workspaceId, viewerUserId, userRole = 'parentA') {
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
  const safeThreadId = requireEntityId(threadId, 'threadId');
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');
  const thread = await prisma.thread.findFirst({
    where: { id: safeThreadId, workspaceId: safeWorkspaceId },
    include: {
      messages: { orderBy: { sentAt: 'asc' } }
    }
  });

  if (!thread || !canUserAccessThread(userRole, thread)) {
    return null;
  }

  return serializeThread(thread, thread.messages, viewerUserId);
}

export async function getOrCreateFamilyThread({
  workspaceId,
  createdById,
  threadKeys
}) {
  requireThreadKeys(threadKeys);

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

  await assertValidParentThreadKeys(workspaceId, threadKeys);

  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.thread.create({
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
    await createThreadKeysInTx(tx, created.id, threadKeys);
    return created;
  });

  return getThreadById(workspaceId, thread.id, createdById, 'parentA');
}

export async function createThread({
  workspaceId,
  createdBy,
  subject,
  category,
  childId,
  threadKeys
}) {
  if (subject === category && category === FAMILY_CATEGORY) {
    return getOrCreateFamilyThread({
      workspaceId,
      createdById: createdBy.id,
      threadKeys
    });
  }

  if (subject === category && CATEGORY_CHANNELS.includes(category)) {
    return getOrCreateCategoryThread({
      workspaceId,
      createdBy,
      category,
      threadKeys
    });
  }

  await assertValidParentThreadKeys(workspaceId, threadKeys);

  let safeChildId = null;
  if (childId) {
    safeChildId = requireEntityId(childId, 'childId');
    const child = await prisma.child.findFirst({
      where: { id: safeChildId, workspaceId }
    });
    if (!child) {
      const error = new Error('child_not_found');
      error.code = 'child_not_found';
      throw error;
    }
  }

  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.thread.create({
      data: {
        workspaceId,
        subject,
        category,
        childId: safeChildId,
        createdById: createdBy.id,
        audience: 'parents',
        lastActivity: new Date()
      }
    });
    await createThreadKeysInTx(tx, created.id, threadKeys);
    return created;
  });

  return getThreadById(workspaceId, thread.id, createdBy.id, createdBy.role);
}

export async function getOrCreateCategoryThread({
  workspaceId,
  createdBy,
  category,
  threadKeys = null
}) {
  if (!CATEGORY_CHANNELS.includes(category)) {
    const error = new Error('invalid_category');
    error.code = 'invalid_category';
    throw error;
  }

  const systemChannel = isSystemCategory(category);

  if (!systemChannel) {
    requireThreadKeys(threadKeys);
  }

  const existing = await prisma.thread.findFirst({
    where: { workspaceId, category, subject: category, audience: 'parents' },
    orderBy: { createdAt: 'asc' }
  });

  if (existing) {
    return getThreadById(workspaceId, existing.id, createdBy.id, createdBy.role);
  }

  if (!systemChannel) {
    await assertValidParentThreadKeys(workspaceId, threadKeys);
  }

  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.thread.create({
      data: {
        workspaceId,
        subject: category,
        category,
        childId: null,
        createdById: createdBy.id,
        audience: 'parents',
        isSystemChannel: systemChannel,
        lastActivity: new Date()
      }
    });
    if (!systemChannel) {
      await createThreadKeysInTx(tx, created.id, threadKeys);
    }
    return created;
  });

  return getThreadById(workspaceId, thread.id, createdBy.id, createdBy.role);
}

export async function getMyThreadKey({ workspaceId, threadId, user }) {
  const safeThreadId = requireEntityId(threadId, 'threadId');
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');

  const thread = await prisma.thread.findFirst({
    where: { id: safeThreadId, workspaceId: safeWorkspaceId }
  });

  if (!thread || !canUserAccessThread(user.role, thread)) {
    return { error: 'thread_not_found', status: 404 };
  }

  const row = await prisma.threadKey.findUnique({
    where: {
      threadId_userId: {
        threadId: safeThreadId,
        userId: user.id
      }
    }
  });

  if (!row) {
    return { error: 'thread_key_not_found', status: 404 };
  }

  return { encryptedKey: row.encryptedKey };
}

export async function syncFamilyThreadKey({
  workspaceId,
  threadId,
  userId,
  encryptedKey
}) {
  const safeThreadId = requireEntityId(threadId, 'threadId');
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');
  const safeUserId = requireEntityId(userId, 'userId');

  const thread = await prisma.thread.findFirst({
    where: { id: safeThreadId, workspaceId: safeWorkspaceId }
  });

  if (!thread) {
    return { error: 'thread_not_found', status: 404 };
  }

  if (thread.audience !== 'family') {
    return { error: 'invalid_thread_audience', status: 400 };
  }

  const target = await prisma.user.findFirst({
    where: {
      id: safeUserId,
      workspaceId: safeWorkspaceId,
      role: 'child'
    }
  });

  if (!target) {
    return { error: 'invalid_thread_keys', status: 400 };
  }

  const existing = await prisma.threadKey.findUnique({
    where: {
      threadId_userId: {
        threadId: safeThreadId,
        userId: safeUserId
      }
    }
  });

  if (existing) {
    return { error: 'already_exists', status: 409 };
  }

  const row = await prisma.threadKey.create({
    data: {
      threadId: safeThreadId,
      userId: safeUserId,
      encryptedKey
    }
  });

  return { threadKey: { userId: row.userId, encryptedKey: row.encryptedKey } };
}

export async function markThreadAsRead({
  workspaceId,
  threadId,
  userId,
  userRole = 'parentA'
}) {
  const safeThreadId = requireEntityId(threadId, 'threadId');
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');
  const safeUserId = requireEntityId(userId, 'userId');

  const thread = await prisma.thread.findFirst({
    where: { id: safeThreadId, workspaceId: safeWorkspaceId }
  });

  if (!thread || !canUserAccessThread(userRole, thread)) {
    return null;
  }

  await prisma.message.updateMany({
    where: {
      threadId: safeThreadId,
      workspaceId: safeWorkspaceId,
      senderId: { not: safeUserId },
      isRead: false
    },
    data: { isRead: true }
  });

  return getThreadById(safeWorkspaceId, safeThreadId, safeUserId, userRole);
}

/**
 * Client E2E path only: ciphertext + nonce → KEY_MESSAGES(JSON envelope).
 */
export async function addMessageToThread({
  workspaceId,
  threadId,
  sender,
  ciphertext,
  nonce,
  tone = 'neutral',
  attachments = []
}) {
  const safeThreadId = requireEntityId(threadId, 'threadId');
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');

  const thread = await prisma.thread.findFirst({
    where: { id: safeThreadId, workspaceId: safeWorkspaceId }
  });

  if (!thread || !canUserSendMessage(sender.role, thread)) {
    return null;
  }

  const normalizedAttachments = normalizeAttachments(attachments);
  const safeCiphertext = String(ciphertext ?? '').trim();
  const safeNonce = String(nonce ?? '').trim();
  if (!safeCiphertext || !safeNonce) {
    const error = new Error('message_empty');
    error.code = 'message_empty';
    throw error;
  }

  const plaintextForAtRest = JSON.stringify({
    ciphertext: safeCiphertext,
    nonce: safeNonce
  });

  const sentAt = new Date();
  const senderDisplayName =
    decryptOptionalSafe(sender.name, CRYPTO_KEYS.KEY_GENERAL, '') ||
    sender.name ||
    'Użytkownik';
  const senderName = senderDisplayName.split(' ')[0] || senderDisplayName;
  const encryptedContent = encryptOptional(
    plaintextForAtRest,
    CRYPTO_KEYS.KEY_MESSAGES
  );
  const encryptedAttachments =
    normalizedAttachments.length > 0
      ? encryptOptional(JSON.stringify(normalizedAttachments), CRYPTO_KEYS.KEY_MESSAGES)
      : null;
  const payload = {
    threadId: thread.id,
    senderId: sender.id,
    content: plaintextForAtRest,
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
        content: encryptedContent,
        messageType: MESSAGE_TYPE_USER,
        tone,
        sentAt,
        isDelivered: true,
        isRead: false,
        hash: createIntegrityHash(payload),
        attachmentsJson: encryptedAttachments
      }
    }),
    prisma.thread.update({
      where: { id: thread.id },
      data: { lastActivity: sentAt }
    })
  ]);

  return getThreadById(workspaceId, thread.id, sender.id, sender.role);
}

/**
 * Server-authored plaintext message for isSystemChannel threads (no E2E).
 * sender = initiating user (FK); does not use canUserSendMessage.
 */
export async function addSystemMessageToThread({
  workspaceId,
  threadId,
  sender,
  content,
  tone = 'neutral'
}) {
  const safeThreadId = requireEntityId(threadId, 'threadId');
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');

  const thread = await prisma.thread.findFirst({
    where: { id: safeThreadId, workspaceId: safeWorkspaceId }
  });

  if (!thread || !thread.isSystemChannel) {
    const error = new Error('not_system_channel');
    error.code = 'not_system_channel';
    throw error;
  }

  const trimmedContent = String(content ?? '').trim();
  if (!trimmedContent) {
    const error = new Error('message_empty');
    error.code = 'message_empty';
    throw error;
  }

  const sentAt = new Date();
  const senderDisplayName =
    decryptOptionalSafe(sender.name, CRYPTO_KEYS.KEY_GENERAL, '') ||
    sender.name ||
    'System';
  const senderName = senderDisplayName.split(' ')[0] || senderDisplayName;
  const encryptedContent = encryptOptional(
    trimmedContent,
    CRYPTO_KEYS.KEY_MESSAGES
  );
  const payload = {
    threadId: thread.id,
    senderId: sender.id,
    content: trimmedContent,
    messageType: MESSAGE_TYPE_SYSTEM,
    sentAt: sentAt.toISOString()
  };

  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: thread.id,
        workspaceId: safeWorkspaceId,
        senderId: sender.id,
        senderName,
        content: encryptedContent,
        messageType: MESSAGE_TYPE_SYSTEM,
        tone,
        sentAt,
        isDelivered: true,
        isRead: false,
        hash: createIntegrityHash(payload),
        attachmentsJson: null
      }
    }),
    prisma.thread.update({
      where: { id: thread.id },
      data: { lastActivity: sentAt }
    })
  ]);

  return getThreadById(safeWorkspaceId, thread.id, sender.id, sender.role);
}

export async function getMessageAttachmentDownload({
  workspaceId,
  threadId,
  messageId,
  attachmentId,
  userRole = 'parentA'
}) {
  const safeThreadId = requireEntityId(threadId, 'threadId');
  const safeWorkspaceId = requireEntityId(workspaceId, 'workspaceId');
  const safeMessageId = requireEntityId(messageId, 'messageId');
  const safeAttachmentId = requireEntityId(attachmentId, 'attachmentId');

  const thread = await prisma.thread.findFirst({
    where: { id: safeThreadId, workspaceId: safeWorkspaceId }
  });

  if (!thread || !canUserAccessThread(userRole, thread)) {
    return null;
  }

  const message = await prisma.message.findFirst({
    where: {
      id: safeMessageId,
      threadId: safeThreadId,
      workspaceId: safeWorkspaceId
    }
  });

  if (!message) {
    return null;
  }

  const attachments = parseStoredAttachments(
    decryptOptionalSafe(message.attachmentsJson, CRYPTO_KEYS.KEY_MESSAGES, '[]')
  );
  const attachment = attachments.find((item) => item.id === safeAttachmentId);
  if (!attachment?.contentBase64) {
    return null;
  }

  return serializeAttachmentsForClient([attachment], { includeContent: true })[0];
}
