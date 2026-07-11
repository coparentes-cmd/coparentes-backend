import { prisma } from '../../lib/prisma.js';
import { custodianLabel, formatPlDate, utcDayStart, addUtcDays } from './dateUtils.js';
import { notifyScheduleThread } from './messaging.js';
import { serializeCustodyException } from './serialization.js';

async function applyAcceptedException(exception) {
  const start = utcDayStart(exception.fromDate);
  const end = utcDayStart(exception.toDate);

  for (let cursor = new Date(start); cursor <= end; cursor = addUtcDays(cursor, 1)) {
    await prisma.custodySlot.upsert({
      where: {
        workspaceId_date: {
          workspaceId: exception.workspaceId,
          date: new Date(cursor)
        }
      },
      create: {
        workspaceId: exception.workspaceId,
        date: new Date(cursor),
        custodian: exception.custodian,
        source: 'exception',
        exceptionId: exception.id
      },
      update: {
        custodian: exception.custodian,
        source: 'exception',
        exceptionId: exception.id
      }
    });
  }
}

export async function createCustodyException({
  workspaceId,
  requester,
  fromDate,
  toDate,
  custodian,
  exceptionType,
  reason
}) {
  if (requester.role !== 'parentA' && requester.role !== 'parentB') {
    const error = new Error('exception_not_allowed');
    error.code = 'exception_not_allowed';
    throw error;
  }

  const activeSchedule = await prisma.custodySchedule.findFirst({
    where: { workspaceId, status: 'active' }
  });
  if (!activeSchedule) {
    const error = new Error('schedule_not_active');
    error.code = 'schedule_not_active';
    throw error;
  }

  const from = utcDayStart(fromDate);
  const to = utcDayStart(toDate ?? fromDate);
  if (to < from) {
    const error = new Error('invalid_date_range');
    error.code = 'invalid_date_range';
    throw error;
  }

  const exception = await prisma.custodyException.create({
    data: {
      workspaceId,
      fromDate: from,
      toDate: to,
      custodian,
      exceptionType: exceptionType ?? (from.getTime() === to.getTime() ? 'singleDay' : 'range'),
      reason: reason ?? null,
      status: 'pending',
      requesterId: requester.id
    }
  });

  const serialized = serializeCustodyException(exception);
  const rangeLabel =
    from.getTime() === to.getTime()
      ? formatPlDate(from)
      : `${formatPlDate(from)} – ${formatPlDate(to)}`;

  await notifyScheduleThread({
    workspaceId,
    sender: requester,
    content: [
      'Wniosek o zmianę opiekuna',
      '',
      `Okres: ${rangeLabel}`,
      `Proponowany opiekun: ${custodianLabel(custodian)}`,
      reason ? `Powód: ${reason}` : null,
      '',
      'Zaakceptuj lub odrzuć w Kalendarz → Grafik opieki.'
    ]
      .filter(Boolean)
      .join('\n')
  });

  return serialized;
}

export async function respondToCustodyException({
  workspaceId,
  exceptionId,
  responder,
  approve,
  responseNote
}) {
  const exception = await prisma.custodyException.findFirst({
    where: { id: exceptionId, workspaceId }
  });

  if (!exception) {
    return null;
  }

  if (exception.status !== 'pending') {
    const error = new Error('exception_not_pending');
    error.code = 'exception_not_pending';
    throw error;
  }

  if (responder.id === exception.requesterId) {
    const error = new Error('exception_not_allowed');
    error.code = 'exception_not_allowed';
    throw error;
  }

  if (responder.role !== 'parentA' && responder.role !== 'parentB') {
    const error = new Error('exception_not_allowed');
    error.code = 'exception_not_allowed';
    throw error;
  }

  const status = approve ? 'accepted' : 'rejected';
  const updated = await prisma.custodyException.update({
    where: { id: exception.id },
    data: {
      status,
      responseNote: responseNote ?? null
    }
  });

  if (approve) {
    await applyAcceptedException(updated);
  }

  const serialized = serializeCustodyException(updated);
  const rangeLabel =
    utcDayStart(updated.fromDate).getTime() === utcDayStart(updated.toDate).getTime()
      ? formatPlDate(updated.fromDate)
      : `${formatPlDate(updated.fromDate)} – ${formatPlDate(updated.toDate)}`;

  await notifyScheduleThread({
    workspaceId,
    sender: responder,
    content: approve
      ? [
          `${responder.name.split(' ')[0]} zaakceptował(a) zmianę opiekuna (${rangeLabel} → ${custodianLabel(updated.custodian)}).`,
          responseNote ? `Uwagi: ${responseNote}` : null
        ]
          .filter(Boolean)
          .join('\n')
      : [
          `${responder.name.split(' ')[0]} odrzucił(a) zmianę opiekuna (${rangeLabel}).`,
          responseNote ? `Uwagi: ${responseNote}` : null
        ]
          .filter(Boolean)
          .join('\n')
  });

  return serialized;
}
