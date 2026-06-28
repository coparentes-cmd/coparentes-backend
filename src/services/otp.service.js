import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../utils/env.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { deleteAllTrustedDevicesForUser } from './trustedDevice.service.js';

export function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) {
    return '***';
  }
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function requiresEmailOtp(user) {
  if (!env.otpEnabled || !env.resendApiKey || !env.resendFromEmail) {
    return false;
  }
  if (!user?.twoFactorEnabled) {
    return false;
  }
  return !String(user.email).endsWith('@accounts.coparentes.internal');
}

export async function purgeOtpChallengesForUser(userId) {
  await prisma.loginOtpChallenge.deleteMany({ where: { userId } });
}

export async function createLoginOtpChallenge(user) {
  await purgeOtpChallengesForUser(user.id);

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 12);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.otpTtlMinutes * 60 * 1000);

  const challenge = await prisma.loginOtpChallenge.create({
    data: {
      userId: user.id,
      codeHash,
      expiresAt,
      used: false,
      failedAttempts: 0,
      lastSentAt: now
    }
  });

  try {
    await sendOtpEmail({ to: user.email, code });
  } catch (error) {
    await prisma.loginOtpChallenge.delete({ where: { id: challenge.id } });
    throw error;
  }

  return {
    challenge,
    expiresAt,
    resendAvailableAt: new Date(
      now.getTime() + env.otpResendCooldownSeconds * 1000
    )
  };
}

export async function resendLoginOtpChallenge(challengeId) {
  const existing = await prisma.loginOtpChallenge.findUnique({
    where: { id: challengeId },
    include: { user: true }
  });

  if (!existing || existing.used) {
    return { error: 'invalid_challenge' };
  }

  const now = new Date();
  const cooldownUntil = new Date(
    existing.lastSentAt.getTime() + env.otpResendCooldownSeconds * 1000
  );
  if (now < cooldownUntil) {
    return {
      error: 'resend_cooldown',
      resendAvailableAt: cooldownUntil
    };
  }

  await purgeOtpChallengesForUser(existing.userId);

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 12);
  const expiresAt = new Date(now.getTime() + env.otpTtlMinutes * 60 * 1000);

  const challenge = await prisma.loginOtpChallenge.create({
    data: {
      userId: existing.userId,
      codeHash,
      expiresAt,
      used: false,
      failedAttempts: 0,
      lastSentAt: now
    },
    include: { user: true }
  });

  try {
    await sendOtpEmail({ to: existing.user.email, code });
  } catch (error) {
    await prisma.loginOtpChallenge.delete({ where: { id: challenge.id } });
    throw error;
  }

  return {
    challenge,
    expiresAt,
    resendAvailableAt: new Date(
      now.getTime() + env.otpResendCooldownSeconds * 1000
    )
  };
}

export async function verifyLoginOtpChallenge({
  challengeId,
  code,
  trustDevice = false
}) {
  const challenge = await prisma.loginOtpChallenge.findUnique({
    where: { id: challengeId },
    include: { user: true }
  });

  if (!challenge || challenge.used) {
    return { error: 'invalid_challenge' };
  }

  if (challenge.expiresAt < new Date()) {
    return { error: 'otp_expired' };
  }

  if (challenge.failedAttempts >= env.otpMaxAttempts) {
    return { error: 'otp_locked' };
  }

  const valid = await bcrypt.compare(String(code), challenge.codeHash);
  if (!valid) {
    const updated = await prisma.loginOtpChallenge.update({
      where: { id: challenge.id },
      data: { failedAttempts: { increment: 1 } }
    });
    const remaining = Math.max(0, env.otpMaxAttempts - updated.failedAttempts);
    return {
      error: 'invalid_otp',
      attemptsRemaining: remaining,
      locked: updated.failedAttempts >= env.otpMaxAttempts
    };
  }

  await prisma.loginOtpChallenge.update({
    where: { id: challenge.id },
    data: { used: true }
  });
  await purgeOtpChallengesForUser(challenge.userId);

  let trustedDeviceToken = null;
  if (trustDevice) {
    const { createTrustedDeviceToken } = await import('./trustedDevice.service.js');
    trustedDeviceToken = await createTrustedDeviceToken(challenge.userId);
  }

  return {
    user: challenge.user,
    trustedDeviceToken
  };
}

export async function invalidateUserSecurityArtifacts(userId) {
  await Promise.all([
    purgeOtpChallengesForUser(userId),
    deleteAllTrustedDevicesForUser(userId)
  ]);
}
