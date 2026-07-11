import { prisma } from '../../lib/prisma.js';

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
