import { prisma } from '../lib/prisma.js';
import { createToken, hashSessionToken } from '../utils/security.js';
import { env } from '../utils/env.js';

const MAX_SESSIONS_PER_USER = 5;

export async function createSessionForUser(userId) {
  const existing = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' }
  });

  if (existing.length >= MAX_SESSIONS_PER_USER) {
    const removeCount = existing.length - MAX_SESSIONS_PER_USER + 1;
    await prisma.session.deleteMany({
      where: {
        id: { in: existing.slice(0, removeCount).map((session) => session.id) }
      }
    });
  }

  const token = createToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + env.sessionTtlDays);

  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt
    }
  });

  return token;
}

export async function deleteSession(token) {
  await prisma.session.deleteMany({
    where: { tokenHash: hashSessionToken(token) }
  });
}

export async function deleteAllSessionsForUser(userId) {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function purgeExpiredSessions() {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
}

export async function findSessionByToken(token) {
  return prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) }
  });
}
