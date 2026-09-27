import { prisma } from '../lib/prisma.js';
import { serializeDocument } from './serializers.js';
import {
  documentContentKey,
  decryptOptional,
  encryptOptional
} from './crypto.service.js';
import { assertAllowedDocumentContent } from '../utils/fileSignature.js';

const ALLOWED_CATEGORIES = new Set([
  'Agreements',
  'School',
  'Medical',
  'Shared',
  'Private'
]);

export const PRIVATE_DOCUMENT_CATEGORY = 'Private';

/** Max documents per workspace (count). */
export const WORKSPACE_DOCUMENT_COUNT_LIMIT = 200;

/** Max total decoded file bytes per workspace. */
export const WORKSPACE_DOCUMENT_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024;

export function isPrivateDocument(document) {
  return document.category === PRIVATE_DOCUMENT_CATEGORY;
}

export function isAllowedDocumentCategory(category) {
  return ALLOWED_CATEGORIES.has(category);
}

/**
 * Pure quota check — unit-testable without DB.
 * @param {{ existingCount: number, existingBytes: number, incomingBytes: number }} usage
 */
export function assertWorkspaceDocumentQuota({
  existingCount,
  existingBytes,
  incomingBytes
}) {
  const count = Number(existingCount) || 0;
  const used = Number(existingBytes) || 0;
  const incoming = Number(incomingBytes) || 0;

  if (count >= WORKSPACE_DOCUMENT_COUNT_LIMIT) {
    const error = new Error('workspace_document_limit_reached');
    error.code = 'workspace_document_limit_reached';
    throw error;
  }

  if (used + incoming > WORKSPACE_DOCUMENT_STORAGE_LIMIT_BYTES) {
    const error = new Error('workspace_storage_limit_reached');
    error.code = 'workspace_storage_limit_reached';
    throw error;
  }
}

function decodedContentByteLength(contentBase64) {
  if (!contentBase64) {
    return 0;
  }
  return Buffer.from(String(contentBase64).replace(/\s/g, ''), 'base64').length;
}

export async function listDocuments(workspaceId, userId) {
  const rows = await prisma.document.findMany({
    where: {
      workspaceId,
      OR: [
        { category: { not: PRIVATE_DOCUMENT_CATEGORY } },
        { category: PRIVATE_DOCUMENT_CATEGORY, uploadedById: userId }
      ]
    },
    include: { child: true },
    orderBy: { updatedAt: 'desc' }
  });

  return rows.map(serializeDocument);
}

export async function createDocument({
  workspaceId,
  uploadedById,
  title,
  category,
  childId,
  fileName,
  mimeType,
  contentBase64
}) {
  if (!isAllowedDocumentCategory(category)) {
    const error = new Error('invalid_document_category');
    error.code = 'invalid_document_category';
    throw error;
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

  if (contentBase64) {
    // Magic-byte allowlist (TXT via mime/extension claim only — no binary signature).
    assertAllowedDocumentContent(contentBase64, { fileName, mimeType });
  }

  const sizeBytes = decodedContentByteLength(contentBase64);

  const usage = await prisma.document.aggregate({
    where: { workspaceId },
    _count: { _all: true },
    _sum: { sizeBytes: true }
  });

  assertWorkspaceDocumentQuota({
    existingCount: usage._count._all,
    existingBytes: usage._sum.sizeBytes ?? 0,
    incomingBytes: sizeBytes
  });

  const row = await prisma.document.create({
    data: {
      workspaceId,
      uploadedById,
      title,
      category,
      childId: childId ?? null,
      fileName: fileName ?? null,
      mimeType: mimeType ?? null,
      // Never accept client fileUrl on create (dead API; bypassed size/encryption).
      fileUrl: null,
      contentBase64: contentBase64
        ? encryptOptional(contentBase64, documentContentKey(category))
        : null,
      sizeBytes
    },
    include: { child: true }
  });

  return serializeDocument(row);
}

export async function getDocumentDownload(workspaceId, documentId, userId) {
  const row = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    include: { child: true }
  });

  if (!row) {
    return null;
  }

  if (isPrivateDocument(row) && row.uploadedById !== userId) {
    return null;
  }

  return {
    ...serializeDocument(row),
    contentBase64: decryptOptional(
      row.contentBase64,
      documentContentKey(row.category)
    ),
    fileUrl: row.fileUrl
  };
}

export async function deleteDocument({ workspaceId, documentId, requesterId }) {
  const existing = await prisma.document.findFirst({
    where: { id: documentId, workspaceId }
  });

  if (!existing) {
    const error = new Error('document_not_found');
    error.code = 'document_not_found';
    throw error;
  }

  // Only Private category documents may be deleted (shared vault is append-only for now).
  if (existing.category !== PRIVATE_DOCUMENT_CATEGORY) {
    const error = new Error('forbidden');
    error.code = 'forbidden';
    throw error;
  }

  // Only the uploader may delete their own private document.
  if (existing.uploadedById !== requesterId) {
    const error = new Error('forbidden');
    error.code = 'forbidden';
    throw error;
  }

  await prisma.document.delete({ where: { id: documentId } });
  return { ok: true, id: documentId };
}
