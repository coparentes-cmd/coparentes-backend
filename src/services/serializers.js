import {
  parseStoredAttachments,
  serializeAttachmentsForClient
} from './messageAttachments.js';
import {
  CRYPTO_KEYS,
  calendarEventKey,
  decryptOptionalSafe,
  documentContentKey
} from './crypto.service.js';

export function serializeUser(user) {
  return {
    id: user.id,
    name: decryptOptionalSafe(
      user.name,
      CRYPTO_KEYS.KEY_GENERAL,
      'Użytkownik'
    ),
    email: user.email,
    role: user.role,
    childProfileId: user.childProfileId ?? null,
    twoFactorEnabled: user.twoFactorEnabled,
    highConflictMode: user.highConflictMode,
    mustChangePassword: Boolean(user.mustChangePassword),
    themeMode: user.themeMode,
    colorScheme: user.colorScheme,
    createdAt: user.createdAt.toISOString()
  };
}

export function serializeChild(child) {
  return {
    id: child.id,
    name: decryptOptionalSafe(child.name, CRYPTO_KEYS.KEY_GENERAL, 'Dziecko'),
    dateOfBirth: child.dateOfBirth.toISOString(),
    school: decryptOptionalSafe(child.school, CRYPTO_KEYS.KEY_GENERAL, ''),
    // Additive: User.id of the linked child login account, or null if not joined yet.
    linkedAccountId: child.linkedAccount?.id ?? null
  };
}

export function serializeMessage(message) {
  const attachmentsJson = decryptOptionalSafe(
    message.attachmentsJson,
    CRYPTO_KEYS.KEY_MESSAGES,
    '[]'
  );
  const attachments = parseStoredAttachments(attachmentsJson);
  const messageType = message.messageType === 'system' ? 'system' : 'user';
  const atRestPayload = decryptOptionalSafe(
    message.content,
    CRYPTO_KEYS.KEY_MESSAGES,
    messageType === 'system' ? '[wiadomość niedostępna]' : ''
  );

  const base = {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    senderName: message.senderName,
    messageType,
    tone: message.tone,
    attachments: serializeAttachmentsForClient(attachments),
    sentAt: message.sentAt.toISOString(),
    isDelivered: message.isDelivered,
    isRead: message.isRead,
    hash: message.hash,
    isShielded: message.tone === 'aggressive'
  };

  // System + new user messages: plaintext under KEY_MESSAGES.
  // Legacy E2E user messages were stored as KEY_MESSAGES(JSON {ciphertext,nonce}).
  if (messageType === 'system') {
    return { ...base, content: atRestPayload };
  }

  if (atRestPayload) {
    try {
      const parsed = JSON.parse(atRestPayload);
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.ciphertext === 'string' &&
        typeof parsed.nonce === 'string'
      ) {
        // Abandoned client-E2E history — not recoverable server-side.
        return { ...base, content: '', legacyE2e: true };
      }
    } catch (_) {
      // Not JSON → treat as plaintext user message.
    }
  }

  return { ...base, content: atRestPayload || '' };
}

export function serializeThread(thread, messages, viewerUserId = null) {
  const hasUnread =
    viewerUserId == null
      ? messages.some((message) => !message.isRead)
      : messages.some(
          (message) => !message.isRead && message.senderId !== viewerUserId
        );

  return {
    id: thread.id,
    subject: thread.subject,
    category: thread.category,
    childId: thread.childId,
    audience: thread.audience ?? 'parents',
    isSystemChannel: Boolean(thread.isSystemChannel),
    lastActivity: thread.lastActivity.toISOString(),
    hasUnread,
    messages: messages.map(serializeMessage)
  };
}

export function serializeExportJob(job) {
  return {
    id: job.id,
    type: job.type,
    fromDate: job.fromDate.toISOString(),
    toDate: job.toDate.toISOString(),
    status: String(job.status),
    downloadUrl: job.downloadUrl,
    manifestHash: job.manifestHash,
    expiresAt: job.expiresAt ? job.expiresAt.toISOString() : null,
    createdAt: job.createdAt.toISOString()
  };
}

export function serializeDocument(document) {
  return {
    id: document.id,
    title: document.title,
    category: document.category,
    childId: document.childId,
    childName: document.child
      ? decryptOptionalSafe(document.child.name, CRYPTO_KEYS.KEY_GENERAL, 'Dziecko')
      : null,
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileUrl: document.fileUrl,
    sizeBytes: document.sizeBytes,
    uploadedBy: document.uploadedById,
    hasFile: Boolean(document.contentBase64 || document.fileUrl),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  };
}

export function serializeEmailInvite(invite) {
  return {
    id: invite.id,
    email: invite.email,
    status: invite.status,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null
  };
}
