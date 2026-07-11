import { prisma } from '../../lib/prisma.js';

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
