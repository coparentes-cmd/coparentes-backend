import { prisma } from '../lib/prisma.js';
import {
  addMessageToThread,
  getOrCreateCategoryThread
} from './threads.js';

const SCHEDULE_MESSAGING_CATEGORY = 'Zmiana grafiku';
const GENERATION_MONTHS = 12;
const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

const ALL_PARENT_A = {
  monday: 'parentA',
  tuesday: 'parentA',
  wednesday: 'parentA',
  thursday: 'parentA',
  friday: 'parentA',
  saturday: 'parentA',
  sunday: 'parentA'
};

const ALL_PARENT_B = {
  monday: 'parentB',
  tuesday: 'parentB',
  wednesday: 'parentB',
  thursday: 'parentB',
  friday: 'parentB',
  saturday: 'parentB',
  sunday: 'parentB'
};

export const PATTERN_PRESETS = {
  weekAlternating: {
    weekA: ALL_PARENT_A,
    weekB: ALL_PARENT_B
  },
  everyOtherWeekend: {
    weekA: {
      monday: 'parentA',
      tuesday: 'parentA',
      wednesday: 'parentA',
      thursday: 'parentA',
      friday: 'parentA',
      saturday: 'parentB',
      sunday: 'parentB'
    },
    weekB: {
      monday: 'parentB',
      tuesday: 'parentB',
      wednesday: 'parentB',
      thursday: 'parentB',
      friday: 'parentB',
      saturday: 'parentA',
      sunday: 'parentA'
    }
  }
};

function formatPlDate(value) {
  const date = new Date(value);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

function utcDayStart(isoDate) {
  const date = new Date(isoDate);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  );
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function custodianLabel(role) {
  return role === 'parentA' ? 'Mama' : 'Tata';
}

function patternLabel(patternType) {
  switch (patternType) {
    case 'weekAlternating':
      return 'Co tydzień na zmianę';
    case 'everyOtherWeekend':
      return 'Co drugi weekend';
    case 'customWeek':
      return 'Własny tydzień';
    default:
      return patternType;
  }
}

async function notifyScheduleThread({ workspaceId, sender, content }) {
  try {
    const thread = await getOrCreateCategoryThread({
      workspaceId,
      createdBy: sender,
      category: SCHEDULE_MESSAGING_CATEGORY
    });

    await addMessageToThread({
      workspaceId,
      threadId: thread.id,
      sender,
      content,
      tone: 'neutral'
    });
  } catch (error) {
    console.error('schedule_messaging_notify_failed', error);
  }
}

export function resolveWeekPattern(patternType, weekA, weekB) {
  if (patternType === 'customWeek') {
    return {
      weekA: weekA ?? ALL_PARENT_A,
      weekB: weekB ?? ALL_PARENT_B
    };
  }

  const preset = PATTERN_PRESETS[patternType];
  if (!preset) {
    return PATTERN_PRESETS.weekAlternating;
  }
  return preset;
}

export function getCustodianForDate(schedule, date) {
  const weekA = JSON.parse(schedule.weekAJson);
  const weekB = JSON.parse(schedule.weekBJson);
  const start = utcDayStart(schedule.startDate);
  const current = utcDayStart(date);
  const diffDays = Math.floor((current - start) / (24 * 60 * 60 * 1000));
  const weekIndex = Math.floor(diffDays / 7);
  const dayName = DAY_NAMES[current.getUTCDay()];
  const week = weekIndex % 2 === 0 ? weekA : weekB;
  return week[dayName] ?? week.monday ?? 'parentA';
}

export function serializeCustodySchedule(schedule) {
  return {
    id: schedule.id,
    patternType: schedule.patternType,
    startDate: schedule.startDate.toISOString(),
    endDate: schedule.endDate ? schedule.endDate.toISOString() : null,
    weekA: JSON.parse(schedule.weekAJson),
    weekB: JSON.parse(schedule.weekBJson),
    handoverTime: schedule.handoverTime,
    handoverLocation: schedule.handoverLocation,
    status: schedule.status,
    proposedById: schedule.proposedById,
    approvedById: schedule.approvedById,
    approvedAt: schedule.approvedAt ? schedule.approvedAt.toISOString() : null,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString()
  };
}

export function serializeCustodyException(exception) {
  return {
    id: exception.id,
    fromDate: exception.fromDate.toISOString(),
    toDate: exception.toDate.toISOString(),
    custodian: exception.custodian,
    exceptionType: exception.exceptionType,
    reason: exception.reason,
    status: exception.status,
    requesterId: exception.requesterId,
    responseNote: exception.responseNote,
    createdAt: exception.createdAt.toISOString(),
    updatedAt: exception.updatedAt.toISOString()
  };
}

export async function getActiveOrPendingSchedule(workspaceId) {
  const pending = await prisma.custodySchedule.findFirst({
    where: { workspaceId, status: 'pendingApproval' },
    orderBy: { createdAt: 'desc' }
  });
  if (pending) {
    return pending;
  }

  return prisma.custodySchedule.findFirst({
    where: { workspaceId, status: 'active' },
    orderBy: { createdAt: 'desc' }
  });
}

export async function generateSlotsFromSchedule(schedule, monthsAhead = GENERATION_MONTHS) {
  const start = utcDayStart(schedule.startDate);
  const end = schedule.endDate
    ? addUtcDays(utcDayStart(schedule.endDate), 1)
    : addUtcMonths(start, monthsAhead);
  const protectedSlots = await prisma.custodySlot.findMany({
    where: {
      workspaceId: schedule.workspaceId,
      date: { gte: start, lt: end },
      source: { in: ['exception', 'swap'] }
    },
    select: { date: true }
  });
  const protectedDays = new Set(
    protectedSlots.map((slot) => utcDayStart(slot.date).toISOString())
  );

  await prisma.custodySlot.deleteMany({
    where: {
      workspaceId: schedule.workspaceId,
      scheduleId: schedule.id,
      source: 'schedule',
      date: { gte: start, lt: end }
    }
  });

  const rows = [];
  for (let cursor = new Date(start); cursor < end; cursor = addUtcDays(cursor, 1)) {
    const dayKey = cursor.toISOString();
    if (protectedDays.has(dayKey)) {
      continue;
    }

    rows.push({
      workspaceId: schedule.workspaceId,
      date: new Date(cursor),
      custodian: getCustodianForDate(schedule, cursor),
      handoverLocation: schedule.handoverLocation,
      handoverTime: schedule.handoverTime,
      source: 'schedule',
      scheduleId: schedule.id,
      exceptionId: null
    });
  }

  for (const row of rows) {
    await prisma.custodySlot.upsert({
      where: {
        workspaceId_date: {
          workspaceId: row.workspaceId,
          date: row.date
        }
      },
      create: row,
      update: {
        custodian: row.custodian,
        handoverLocation: row.handoverLocation,
        handoverTime: row.handoverTime,
        source: 'schedule',
        scheduleId: schedule.id,
        exceptionId: null
      }
    });
  }

  return rows.length;
}

export async function proposeCustodySchedule({
  workspaceId,
  proposer,
  patternType,
  startDate,
  endDate,
  weekA,
  weekB,
  handoverTime,
  handoverLocation
}) {
  if (proposer.role !== 'parentA' && proposer.role !== 'parentB') {
    const error = new Error('schedule_not_allowed');
    error.code = 'schedule_not_allowed';
    throw error;
  }

  const resolved = resolveWeekPattern(patternType, weekA, weekB);
  const normalizedStart = utcDayStart(startDate);
  const normalizedEnd = endDate ? utcDayStart(endDate) : null;

  if (normalizedEnd && normalizedEnd < normalizedStart) {
    const error = new Error('invalid_date_range');
    error.code = 'invalid_date_range';
    throw error;
  }

  await prisma.custodySchedule.updateMany({
    where: {
      workspaceId,
      status: 'pendingApproval'
    },
    data: { status: 'superseded' }
  });

  const schedule = await prisma.custodySchedule.create({
    data: {
      workspaceId,
      patternType,
      startDate: normalizedStart,
      endDate: normalizedEnd,
      weekAJson: JSON.stringify(resolved.weekA),
      weekBJson: JSON.stringify(resolved.weekB),
      handoverTime: handoverTime ?? null,
      handoverLocation: handoverLocation ?? null,
      status: 'pendingApproval',
      proposedById: proposer.id
    }
  });

  const serialized = serializeCustodySchedule(schedule);
  const rangeLabel = normalizedEnd
    ? `${formatPlDate(normalizedStart)} – ${formatPlDate(normalizedEnd)}`
    : `od ${formatPlDate(normalizedStart)}`;
  await notifyScheduleThread({
    workspaceId,
    sender: proposer,
    content: [
      'Propozycja grafiku opieki',
      '',
      `Szablon: ${patternLabel(patternType)}`,
      `Obowiązuje: ${rangeLabel}`,
      handoverTime ? `Przekazanie: ${handoverTime}` : null,
      handoverLocation ? `Miejsce: ${handoverLocation}` : null,
      '',
      'Zaakceptuj lub odrzuć w Kalendarz → Grafik opieki.'
    ]
      .filter(Boolean)
      .join('\n')
  });

  return serialized;
}

export async function respondToCustodySchedule({
  workspaceId,
  scheduleId,
  responder,
  approve,
  responseNote
}) {
  const schedule = await prisma.custodySchedule.findFirst({
    where: { id: scheduleId, workspaceId }
  });

  if (!schedule) {
    return null;
  }

  if (schedule.status !== 'pendingApproval') {
    const error = new Error('schedule_not_pending');
    error.code = 'schedule_not_pending';
    throw error;
  }

  if (responder.id === schedule.proposedById) {
    const error = new Error('schedule_not_allowed');
    error.code = 'schedule_not_allowed';
    throw error;
  }

  if (responder.role !== 'parentA' && responder.role !== 'parentB') {
    const error = new Error('schedule_not_allowed');
    error.code = 'schedule_not_allowed';
    throw error;
  }

  if (!approve) {
    const rejected = await prisma.custodySchedule.update({
      where: { id: schedule.id },
      data: { status: 'superseded' }
    });
    const serialized = serializeCustodySchedule(rejected);
    await notifyScheduleThread({
      workspaceId,
      sender: responder,
      content: [
        `${responder.name.split(' ')[0]} odrzucił(a) propozycję grafiku opieki (${patternLabel(schedule.patternType)}).`,
        responseNote ? `Uwagi: ${responseNote}` : null
      ]
        .filter(Boolean)
        .join('\n')
    });
    return serialized;
  }

  await prisma.custodySchedule.updateMany({
    where: { workspaceId, status: 'active' },
    data: { status: 'superseded' }
  });

  const active = await prisma.custodySchedule.update({
    where: { id: schedule.id },
    data: {
      status: 'active',
      approvedById: responder.id,
      approvedAt: new Date()
    }
  });

  await generateSlotsFromSchedule(active);

  const serialized = serializeCustodySchedule(active);
  await notifyScheduleThread({
    workspaceId,
    sender: responder,
    content: [
      `${responder.name.split(' ')[0]} zaakceptował(a) grafik opieki (${patternLabel(schedule.patternType)}).`,
      `Obowiązuje od ${formatPlDate(schedule.startDate)}.`,
      responseNote ? `Uwagi: ${responseNote}` : null
    ]
      .filter(Boolean)
      .join('\n')
  });

  return serialized;
}

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

export async function updateCustodySlotHandover({
  workspaceId,
  slotId,
  handoverTime,
  handoverLocation,
  user
}) {
  if (user.role !== 'parentA' && user.role !== 'parentB') {
    const error = new Error('slot_not_allowed');
    error.code = 'slot_not_allowed';
    throw error;
  }

  const lockedSchedule = await prisma.custodySchedule.findFirst({
    where: {
      workspaceId,
      status: { in: ['active', 'pendingApproval'] }
    }
  });
  if (lockedSchedule) {
    const error = new Error('schedule_locked');
    error.code = 'schedule_locked';
    throw error;
  }

  const slot = await prisma.custodySlot.findFirst({
    where: { id: slotId, workspaceId }
  });

  if (!slot) {
    return null;
  }

  const updated = await prisma.custodySlot.update({
    where: { id: slot.id },
    data: {
      handoverTime: handoverTime ?? null,
      handoverLocation: handoverLocation ?? null
    }
  });

  return {
    id: updated.id,
    date: updated.date.toISOString(),
    custodian: updated.custodian,
    handoverLocation: updated.handoverLocation,
    handoverTime: updated.handoverTime,
    source: updated.source
  };
}
