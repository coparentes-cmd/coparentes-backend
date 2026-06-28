import { prisma } from '../lib/prisma.js';
import { serializeDocument } from './serializers.js';
import {
  CRYPTO_KEYS,
  documentContentKey,
  decryptOptional,
  encryptOptional
} from './crypto.service.js';

const ALLOWED_CATEGORIES = new Set([
  'Agreements',
  'School',
  'Medical',
  'Shared',
  'Private'
]);

export const PRIVATE_DOCUMENT_CATEGORY = 'Private';

export function isPrivateDocument(document) {
  return document.category === PRIVATE_DOCUMENT_CATEGORY;
}

export function isAllowedDocumentCategory(category) {
  return ALLOWED_CATEGORIES.has(category);
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
  fileUrl,
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

  const sizeBytes = contentBase64 ? Buffer.byteLength(contentBase64, 'utf8') : 0;

  const row = await prisma.document.create({
    data: {
      workspaceId,
      uploadedById,
      title,
      category,
      childId: childId ?? null,
      fileName: fileName ?? null,
      mimeType: mimeType ?? null,
      fileUrl: fileUrl ?? null,
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
