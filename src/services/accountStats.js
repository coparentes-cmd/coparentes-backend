import { prisma } from '../lib/prisma.js';

/**
 * Aggregate account / workspace counts for ops mail (no PII).
 * Active users = soft-delete not set (`deletedAt` null).
 */
export async function getAccountStats(client = prisma) {
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    usersActive,
    usersDeleted,
    workspacesTotal,
    roleGroups,
    usersCreatedLast7Days,
    usersCreatedLast30Days
  ] = await Promise.all([
    client.user.count({ where: { deletedAt: null } }),
    client.user.count({ where: { deletedAt: { not: null } } }),
    client.workspace.count(),
    client.user.groupBy({
      by: ['role'],
      where: { deletedAt: null },
      _count: { _all: true }
    }),
    client.user.count({
      where: { deletedAt: null, createdAt: { gte: last7 } }
    }),
    client.user.count({
      where: { deletedAt: null, createdAt: { gte: last30 } }
    })
  ]);

  const usersByRole = {
    parentA: 0,
    parentB: 0,
    child: 0,
    observer: 0
  };
  for (const row of roleGroups) {
    if (Object.prototype.hasOwnProperty.call(usersByRole, row.role)) {
      usersByRole[row.role] = row._count._all;
    }
  }

  const parentsActive = usersByRole.parentA + usersByRole.parentB;

  return {
    generatedAt: now.toISOString(),
    usersActive,
    usersDeleted,
    parentsActive,
    usersByRole,
    workspacesTotal,
    usersCreatedLast7Days,
    usersCreatedLast30Days
  };
}
