import crypto from 'node:crypto';

import { prisma } from '../lib/prisma.js';
import { createIntegrityHash } from '../utils/security.js';
import { env } from '../utils/env.js';
import { addDays } from '../utils/time.js';
import { serializeExportJob } from './serializers.js';
import { getWorkspaceGraph } from './workspace.js';
import { getThreadById, listThreads } from './threads.js';
import { listCalendarExportItems } from './calendar.js';
import { listExpensesInRange } from './finances.js';

function buildPublicUrl(pathname) {
  if (!env.publicBaseUrl) {
    return pathname;
  }
  return `${env.publicBaseUrl}${pathname}`;
}

function filterThreadsByDateRange(threads, fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  return threads
    .map((thread) => ({
      ...thread,
      messages: thread.messages.filter((message) => {
        const sentAt = new Date(message.sentAt);
        return sentAt >= from && sentAt <= to;
      })
    }))
    .filter((thread) => thread.messages.length > 0);
}

async function loadMessageThreads(workspaceId, threadId) {
  if (threadId) {
    const thread = await getThreadById(workspaceId, threadId);
    return thread ? [thread] : [];
  }

  return listThreads(workspaceId);
}

async function buildExportPayload({
  workspaceId,
  type,
  threadId,
  fromDate,
  toDate
}) {
  const workspace = await getWorkspaceGraph(workspaceId);
  let items = [];

  if (type === 'messages') {
    const threads = await loadMessageThreads(workspaceId, threadId);
    items = filterThreadsByDateRange(threads, fromDate, toDate);
  } else if (type === 'calendar') {
    items = await listCalendarExportItems(workspaceId, fromDate, toDate);
  } else if (type === 'finances') {
    const expenses = await listExpensesInRange(workspaceId, fromDate, toDate);
    items = expenses.map((expense) => ({
      recordType: 'expense',
      ...expense
    }));
  } else if (type === 'fullPack') {
    const threads = await loadMessageThreads(workspaceId, threadId);
    const [calendarItems, expenses] = await Promise.all([
      listCalendarExportItems(workspaceId, fromDate, toDate),
      listExpensesInRange(workspaceId, fromDate, toDate)
    ]);

    items = [
      ...filterThreadsByDateRange(threads, fromDate, toDate).map((thread) => ({
        recordType: 'messageThread',
        ...thread
      })),
      ...calendarItems,
      ...expenses.map((expense) => ({
        recordType: 'expense',
        ...expense
      }))
    ];
  }

  return {
    id: crypto.randomUUID(),
    type,
    fromDate,
    toDate,
    generatedAt: new Date().toISOString(),
    workspace,
    items
  };
}

export async function listExportJobs(workspaceId) {
  const rows = await prisma.exportJob.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  });

  return rows.map(serializeExportJob);
}

export async function createExportJob({
  workspaceId,
  requestedById,
  type,
  fromDate,
  toDate,
  threadId
}) {
  const payload = await buildExportPayload({
    workspaceId,
    type,
    threadId: threadId ?? null,
    fromDate,
    toDate
  });
  const manifestHash = createIntegrityHash(payload);
  const exportId = crypto.randomUUID();
  const downloadUrl = buildPublicUrl(`/api/exports/${exportId}/download`);
  const expiresAt = addDays(new Date(), env.exportTtlDays);

  const row = await prisma.exportJob.create({
    data: {
      id: exportId,
      workspaceId,
      requestedById,
      type,
      threadId: threadId ?? null,
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      status: 'completed',
      downloadUrl,
      manifestHash,
      payloadJson: JSON.stringify(payload),
      expiresAt
    }
  });

  return serializeExportJob(row);
}

export async function getExportDownload(workspaceId, exportId) {
  const row = await prisma.exportJob.findFirst({
    where: { id: exportId, workspaceId }
  });

  if (!row) {
    return null;
  }

  if (row.expiresAt && row.expiresAt < new Date()) {
    return { expired: true };
  }

  return {
    ...serializeExportJob(row),
    payload: JSON.parse(row.payloadJson)
  };
}

export async function purgeExpiredExportJobs() {
  await prisma.exportJob.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
}
