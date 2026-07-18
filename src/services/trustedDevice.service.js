import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { env } from '../utils/env.js';
import { requireEntityId } from '../utils/ids.js';
import { createToken } from '../utils/security.js';

export const TRUSTED_DEVICE_COOKIE = 'coparentes_trusted_device';

export async function createTrustedDeviceToken(userId) {
  const safeUserId = requireEntityId(userId, 'userId');
  const token = createToken(32);
  const tokenHash = await bcrypt.hash(token, 12);
  const expiresAt = new Date(
    Date.now() + env.trustedDeviceTtlDays * 24 * 60 * 60 * 1000
  );

  await prisma.trustedDevice.create({
    data: {
      userId: safeUserId,
      tokenHash,
      expiresAt
    }
  });

  return token;
}

export function readTrustedDeviceToken(req) {
  const headerToken = req.headers['x-trusted-device-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=');
    if (name === TRUSTED_DEVICE_COOKIE) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

export async function isTrustedDeviceValid(userId, token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const safeUserId = requireEntityId(userId, 'userId');
  const now = new Date();

  const devices = await prisma.trustedDevice.findMany({
    where: {
      userId: safeUserId,
      expiresAt: { gt: now }
    }
  });

  for (const device of devices) {
    if (await bcrypt.compare(token, device.tokenHash)) {
      return true;
    }
  }

  return false;
}

export async function deleteAllTrustedDevicesForUser(userId) {
  const safeUserId = requireEntityId(userId, 'userId');
  await prisma.trustedDevice.deleteMany({ where: { userId: safeUserId } });
}

export function trustedDeviceCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: env.trustedDeviceTtlDays * 24 * 60 * 60 * 1000,
    path: '/'
  };
}
