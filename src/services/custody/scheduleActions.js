import { prisma } from '../../lib/prisma.js';
import { formatPlDate, utcDayStart } from './dateUtils.js';
import { notifyScheduleThread } from './messaging.js';
import { patternLabel, resolveWeekPattern } from './pattern.js';
import { generateSlotsFromSchedule } from './slotGeneration.js';
import { serializeCustodySchedule } from './serialization.js';

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
