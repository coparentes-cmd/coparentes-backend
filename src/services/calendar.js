import { prisma } from '../lib/prisma.js';

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

  return serializeSwapRequest(updated);
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

  return serializeSwapRequest(row);
}
