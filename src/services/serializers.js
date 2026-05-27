export function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled,
    highConflictMode: user.highConflictMode,
    createdAt: user.createdAt.toISOString()
  };
}

export function serializeChild(child) {
  return {
    id: child.id,
    name: child.name,
    dateOfBirth: child.dateOfBirth.toISOString(),
    school: child.school
  };
}

export function serializeMessage(message) {
  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    senderName: message.senderName,
    content: message.content,
    tone: message.tone,
    attachments: [],
    sentAt: message.sentAt.toISOString(),
    isDelivered: message.isDelivered,
    isRead: message.isRead,
    hash: message.hash,
    isShielded: message.tone === 'aggressive'
  };
}

export function serializeThread(thread, messages) {
  return {
    id: thread.id,
    subject: thread.subject,
    category: thread.category,
    childId: thread.childId,
    lastActivity: thread.lastActivity.toISOString(),
    hasUnread: messages.some((message) => !message.isRead),
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
    childName: document.child?.name ?? null,
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
