import { prisma } from '../lib/prisma.js';
import {
  addMessageToThread,
  getOrCreateCategoryThread
} from './threads.js';

const SWAP_MESSAGING_CATEGORY = 'Zmiana grafiku';

function formatPlDate(value) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

function buildSwapRequestMessage(swap) {
  let content = [
    'Wniosek o zamianę dnia opieki',
    '',
    `Oryginalny dzień: ${formatPlDate(swap.originalDate)}`,
    `Proponowany dzień: ${formatPlDate(swap.proposedDate)}`
  ].join('\n');

  if (swap.reason) {
    content += `\nPowód: ${swap.reason}`;
  }

  content +=
    '\n\nOdpowiedz w Kalendarz → Zamiany (Akceptuj/Odrzuć) lub tutaj w wątku.';

  return content;
}

function buildSwapResponseMessage(swap, responder) {
  const from = formatPlDate(swap.originalDate);
  const to = formatPlDate(swap.proposedDate);
  const firstName = responder.name.split(' ')[0] || responder.name;

  if (swap.status === 'accepted') {
    let content = `${firstName} zaakceptował(a) wniosek o zamianę (${from} → ${to}).`;
    if (swap.responseNote) {
      content += `\nUwagi: ${swap.responseNote}`;
    }
    return content;
  }

  if (swap.status === 'rejected') {
    let content = `${firstName} odrzucił(a) wniosek o zamianę (${from} → ${to}).`;
    if (swap.responseNote) {
      content += `\n${swap.responseNote}`;
    }
    return content;
  }

  if (swap.status === 'counterProposed') {
    let content = `${firstName} odrzucił(a) wniosek (${from} → ${to}) i zaproponował(a) inne daty.`;
    if (swap.responseNote) {
      content += `\n${swap.responseNote}`;
    }
    return content;
  }

  let content = `${firstName} zaktualizował(a) wniosek o zamianę (${from} → ${to}). Status: ${swap.status}.`;
  if (swap.responseNote) {
    content += `\nUwagi: ${swap.responseNote}`;
  }
  return content;
}

async function notifySwapInMessagingThread({
  workspaceId,
  sender,
  content
}) {
  const thread = await getOrCreateCategoryThread({
    workspaceId,
    createdBy: sender,
    category: SWAP_MESSAGING_CATEGORY
  });

  await addMessageToThread({
    workspaceId,
    threadId: thread.id,
    sender,
    content,
    tone: 'neutral'
  });
}

export function serializeCustodySlot(slot) {
  return {
    id: slot.id,
    date: slot.date.toISOString(),
    custodian: slot.custodian,
    handoverLocation: slot.handoverLocation,
    handoverTime: slot.handoverTime
  };
}

export function serializeCalendarEvent(event) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate ? event.endDate.toISOString() : null,
    type: event.type,
    childId: event.childId,
    createdBy: event.createdById,
    location: event.location
  };
}

export function serializeSwapRequest(swap) {
  return {
    id: swap.id,
    requesterId: swap.requesterId,
    requesterName: swap.requesterName,
    originalDate: swap.originalDate.toISOString(),
    proposedDate: swap.proposedDate.toISOString(),
    reason: swap.reason,
    status: swap.status,
    createdAt: swap.createdAt.toISOString(),
    responseNote: swap.responseNote
  };
}

export function serializeExpense(expense) {
  return {
    id: expense.id,
    title: expense.title,
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
    childId: expense.childId,
    paidBy: expense.paidById,
    splitRatio: expense.splitRatio,
    date: expense.date.toISOString(),
    receiptUrl: expense.receiptUrl,
    status: expense.status,
    note: expense.note,
    hash: expense.hash
  };
}

export async function listCalendarExportItems(workspaceId, fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  const [custodySlots, events, swapRequests] = await Promise.all([
    prisma.custodySlot.findMany({
      where: {
        workspaceId,
        date: { gte: from, lte: to }
      },
      orderBy: { date: 'asc' }
    }),
    prisma.calendarEvent.findMany({
      where: {
        workspaceId,
        startDate: { lte: to },
        OR: [{ endDate: { gte: from } }, { endDate: null, startDate: { gte: from } }]
      },
      orderBy: { startDate: 'asc' }
    }),
    prisma.swapRequest.findMany({
      where: {
        workspaceId,
        OR: [
          { originalDate: { gte: from, lte: to } },
          { proposedDate: { gte: from, lte: to } },
          { createdAt: { gte: from, lte: to } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return [
    ...custodySlots.map((slot) => ({
      recordType: 'custodySlot',
      ...serializeCustodySlot(slot)
    })),
    ...events.map((event) => ({
      recordType: 'calendarEvent',
      ...serializeCalendarEvent(event)
    })),
    ...swapRequests.map((swap) => ({
      recordType: 'swapRequest',
      ...serializeSwapRequest(swap)
    }))
  ];
}

export async function getCalendarSnapshot(workspaceId) {
  const [custodySlots, events, swapRequests] = await Promise.all([
    prisma.custodySlot.findMany({
      where: { workspaceId },
      orderBy: { date: 'asc' }
    }),
    prisma.calendarEvent.findMany({
      where: { workspaceId },
      orderBy: { startDate: 'asc' }
    }),
    prisma.swapRequest.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return {
    custodySlots: custodySlots.map(serializeCustodySlot),
    events: events.map(serializeCalendarEvent),
    swapRequests: swapRequests.map(serializeSwapRequest)
  };
}

export async function respondToSwapRequest({
  workspaceId,
  swapId,
  status,
  responseNote,
  responder
}) {
  const existing = await prisma.swapRequest.findFirst({
    where: { id: swapId, workspaceId }
  });

  if (!existing) {
    return null;
  }

  if (responder.id === existing.requesterId) {
    const error = new Error('swap_not_allowed');
    error.code = 'swap_not_allowed';
    throw error;
  }

  if (responder.role !== 'parentA' && responder.role !== 'parentB') {
    const error = new Error('swap_not_allowed');
    error.code = 'swap_not_allowed';
    throw error;
  }

  const updated = await prisma.swapRequest.update({
    where: { id: existing.id },
    data: {
      status,
      responseNote: responseNote ?? null
    }
  });

  const serialized = serializeSwapRequest(updated);

  if (status === 'accepted' || status === 'rejected' || status === 'counterProposed') {
    await notifySwapInMessagingThread({
      workspaceId,
      sender: responder,
      content: buildSwapResponseMessage(serialized, responder)
    });
  }

  return serialized;
}

export async function createCalendarEvent({
  workspaceId,
  createdBy,
  title,
  description,
  startDate,
  endDate,
  type,
  childId,
  location
}) {
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

  const row = await prisma.calendarEvent.create({
    data: {
      workspaceId,
      createdById: createdBy.id,
      title,
      description: description ?? null,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      type,
      childId: childId ?? null,
      location: location ?? null
    }
  });

  return serializeCalendarEvent(row);
}

export async function createSwapRequest({
  workspaceId,
  requester,
  originalDate,
  proposedDate,
  reason
}) {
  const row = await prisma.swapRequest.create({
    data: {
      workspaceId,
      requesterId: requester.id,
      requesterName: requester.name,
      originalDate: new Date(originalDate),
      proposedDate: new Date(proposedDate),
      reason: reason ?? null,
      status: 'pending'
    }
  });

  const serialized = serializeSwapRequest(row);

  await notifySwapInMessagingThread({
    workspaceId,
    sender: requester,
    content: buildSwapRequestMessage(serialized)
  });

  return serialized;
}
