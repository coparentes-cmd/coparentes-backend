import { prisma } from '../lib/prisma.js';
import { serializeDocument } from './serializers.js';

const ALLOWED_CATEGORIES = new Set([
  'Agreements',
  'School',
  'Medical',
  'Shared'
]);

export function isAllowedDocumentCategory(category) {
  return ALLOWED_CATEGORIES.has(category);
}

export async function listDocuments(workspaceId) {
  const rows = await prisma.document.findMany({
    where: { workspaceId },
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
      contentBase64: contentBase64 ?? null,
      sizeBytes
    },
    include: { child: true }
  });

  return serializeDocument(row);
}

export async function getDocumentDownload(workspaceId, documentId) {
  const row = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    include: { child: true }
  });

  if (!row) {
    return null;
  }

  return {
    ...serializeDocument(row),
    contentBase64: row.contentBase64,
    fileUrl: row.fileUrl
  };
}
