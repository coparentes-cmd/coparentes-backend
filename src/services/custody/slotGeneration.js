import { prisma } from '../../lib/prisma.js';
import { GENERATION_MONTHS } from './constants.js';
import { addUtcDays, addUtcMonths, utcDayStart } from './dateUtils.js';
import { getCustodianForDate } from './pattern.js';

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
