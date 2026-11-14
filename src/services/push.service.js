import { prisma } from '../lib/prisma.js';

/**
 * F2a: register / unregister device push tokens + stub send.
 * Real FCM/APNs delivery comes after Apple keys (F2b) — here we only persist
 * tokens and log would-be sends so cron/D−3 can be wired safely.
 */

/**
 * @param {{ userId: string, token: string, platform: 'ios' | 'android' }} input
 */
export async function upsertDevicePushToken({ userId, token, platform }) {
  return prisma.devicePushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform, updatedAt: new Date() }
  });
}

/**
 * @param {{ userId: string, token?: string }} input
 * If token omitted, deletes all tokens for the user.
 */
export async function deleteDevicePushTokens({ userId, token }) {
  if (token) {
    return prisma.devicePushToken.deleteMany({
      where: { userId, token }
    });
  }
  return prisma.devicePushToken.deleteMany({
    where: { userId }
  });
}

/**
 * Stub sender — no firebase-admin yet.
 * @param {{ userId: string, title: string, body: string, data?: Record<string, string> }} input
 * @returns {Promise<{ attempted: number, stubbed: true }>}
 */
export async function sendPushToUser({ userId, title, body, data }) {
  const tokens = await prisma.devicePushToken.findMany({
    where: { userId },
    select: { token: true, platform: true }
  });

  if (tokens.length === 0) {
    console.info('[push.stub] no tokens', { userId, title });
    return { attempted: 0, stubbed: true };
  }

  for (const row of tokens) {
    console.info('[push.stub] would send', {
      userId,
      platform: row.platform,
      tokenPrefix: `${row.token.slice(0, 12)}…`,
      title,
      body,
      data: data ?? null
    });
  }

  return { attempted: tokens.length, stubbed: true };
}
