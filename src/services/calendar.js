import { prisma } from '../lib/prisma.js';
import {
  addMessageToThread,
  getOrCreateCategoryThread
} from './threads.js';
import {
  CRYPTO_KEYS,
  calendarEventKey,
  decryptOptional,
  encryptOptional
} from './crypto.service.js';
import {
  getActiveOrPendingSchedule,
  serializeCustodyException,
  serializeCustodySchedule
} from './custodySchedule.js';

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
  try {
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
  } catch (error) {
    console.error('swap_messaging_notify_failed', error);
  }
}

function utcDayBounds(isoDate) {
  const date = new Date(isoDate);
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0)
  );
  return { start, end };
}

async function findCustodySlotForDay(workspaceId, isoDate) {
  const { start, end } = utcDayBounds(isoDate);
  return prisma.custodySlot.findFirst({
    where: {
      workspaceId,
      date: { gte: start, lt: end }
    }
  });
}

async function applyAcceptedSwapToCalendar({
  workspaceId,
  originalDate,
  proposedDate
}) {
  const slotOriginal = await findCustodySlotForDay(workspaceId, originalDate);
  const slotProposed = await findCustodySlotForDay(workspaceId, proposedDate);

  if (!slotOriginal || !slotProposed) {
    console.warn('swap_accept_missing_slots', {
      workspaceId,
      originalDate,
      proposedDate
    });
    return;
  }

  const originalCustodian = slotOriginal.custodian;
  const proposedCustodian = slotProposed.custodian;

  await prisma.$transaction([
    prisma.custodySlot.update({
      where: { id: slotOriginal.id },
      data: { custodian: proposedCustodian, source: 'swap' }
    }),
    prisma.custodySlot.update({
      where: { id: slotProposed.id },
      data: { custodian: originalCustodian, source: 'swap' }
    })
  ]);
}

export function serializeCustodySlot(slot) {
  return {
    id: slot.id,
    date: slot.date.toISOString(),
    custodian: slot.custodian,
    handoverLocation: slot.handoverLocation,
    handoverTime: slot.handoverTime,
    source: slot.source ?? 'schedule'
  };
}

export function serializeCalendarEvent(event) {
  const key = calendarEventKey(event.type);
  return {
    id: event.id,
    title: decryptOptional(event.title, key),
    description: decryptOptional(event.description, key),
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
    title: decryptOptional(expense.title, CRYPTO_KEYS.KEY_FINANCE),
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
    childId: expense.childId,
    paidBy: expense.paidById,
    splitRatio: expense.splitRatio,
    date: expense.date.toISOString(),
    receiptUrl: expense.receiptUrl,
    hasReceipt: Boolean(expense.receiptContentBase64),
    status: expense.status,
    note: decryptOptional(expense.note, CRYPTO_KEYS.KEY_FINANCE),
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
  const [custodySlots, events, swapRequests, custodySchedule, custodyExceptions] =
    await Promise.all([
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
    }),
    getActiveOrPendingSchedule(workspaceId),
    prisma.custodyException.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return {
    custodySlots: custodySlots.map(serializeCustodySlot),
    events: events.map(serializeCalendarEvent),
    swapRequests: swapRequests.map(serializeSwapRequest),
    custodySchedule: custodySchedule
      ? serializeCustodySchedule(custodySchedule)
      : null,
    custodyExceptions: custodyExceptions.map(serializeCustodyException)
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

  if (status === 'accepted') {
    await applyAcceptedSwapToCalendar({
      workspaceId,
      originalDate: existing.originalDate,
      proposedDate: existing.proposedDate
    });
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
      title: encryptOptional(title, calendarEventKey(type)),
      description: encryptOptional(description ?? null, calendarEventKey(type)),
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      type,
      childId: childId ?? null,
      location: location ?? null
    }
  });

  return serializeCalendarEvent(row);
}

export async function updateCalendarEvent({
  workspaceId,
  eventId,
  title,
  description,
  startDate,
  endDate,
  type,
  childId,
  location
}) {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, workspaceId }
  });
  if (!existing) {
    const error = new Error('event_not_found');
    error.code = 'event_not_found';
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

  const row = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      title: encryptOptional(title, calendarEventKey(type)),
      description: encryptOptional(description ?? null, calendarEventKey(type)),
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
