export const MAX_MESSAGE_ATTACHMENTS = 3;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 256 * 1024;

export function decodedBase64ByteLength(base64) {
  const normalized = base64.replace(/\s/g, '');
  const padding = (normalized.match(/=+$/) || [''])[0].length;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

export function normalizeAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) {
    return [];
  }

  if (rawAttachments.length > MAX_MESSAGE_ATTACHMENTS) {
    const error = new Error('too_many_attachments');
    error.code = 'too_many_attachments';
    throw error;
  }

  return rawAttachments.map((attachment, index) => {
    const id = String(attachment.id ?? `att_${index + 1}`);
    const name = String(attachment.name ?? 'attachment').trim();
    const type = String(attachment.type ?? 'application/octet-stream').trim();
    const contentBase64 = String(attachment.contentBase64 ?? '').trim();
    const sizeBytes =
      Number.isFinite(attachment.sizeBytes) && attachment.sizeBytes > 0
        ? Number(attachment.sizeBytes)
        : decodedBase64ByteLength(contentBase64);

    if (!name || !contentBase64) {
      const error = new Error('invalid_attachment');
      error.code = 'invalid_attachment';
      throw error;
    }

    if (sizeBytes > MAX_MESSAGE_ATTACHMENT_BYTES) {
      const error = new Error('attachment_too_large');
      error.code = 'attachment_too_large';
      throw error;
    }

    return {
      id,
      name,
      type,
      sizeBytes,
      contentBase64
    };
  });
}

export function parseStoredAttachments(attachmentsJson) {
  if (!attachmentsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(attachmentsJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((attachment, index) => ({
      id: String(attachment.id ?? `att_${index + 1}`),
      name: String(attachment.name ?? 'attachment'),
      type: String(attachment.type ?? 'application/octet-stream'),
      sizeBytes: Number(attachment.sizeBytes ?? 0),
      contentBase64: attachment.contentBase64 ?? null
    }));
  } catch {
    return [];
  }
}

export function serializeAttachmentsForClient(attachments, { includeContent = false } = {}) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    sizeBytes: attachment.sizeBytes,
    ...(includeContent && attachment.contentBase64
      ? { contentBase64: attachment.contentBase64 }
      : {})
  }));
}

export function findAttachment(attachments, attachmentId) {
  return attachments.find((attachment) => attachment.id === attachmentId) ?? null;
}
