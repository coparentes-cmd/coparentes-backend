import { prisma } from '../lib/prisma.js';

export const MOBILE_TRIAL_DAYS = 30;

/**
 * @param {string | undefined | null} raw
 * @returns {'web' | 'ios' | 'android'}
 */
export function normalizeClientPlatform(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'ios' || value === 'iphone' || value === 'ipad') {
    return 'ios';
  }
  if (value === 'android') {
    return 'android';
  }
  return 'web';
}

export function isMobilePlatform(platform) {
  return platform === 'ios' || platform === 'android';
}

/**
 * Refresh trialing → expired when the clock passed.
 * @param {import('@prisma/client').User} user
 */
export async function refreshUserBillingStatus(user) {
  if (!user) {
    return user;
  }
  if (
    user.billingStatus === 'trialing' &&
    user.trialEndsAt &&
    user.trialEndsAt.getTime() <= Date.now()
  ) {
    return prisma.user.update({
      where: { id: user.id },
      data: { billingStatus: 'expired' }
    });
  }
  if (
    user.billingStatus === 'active' &&
    user.currentPeriodEnd &&
    user.currentPeriodEnd.getTime() <= Date.now()
  ) {
    return prisma.user.update({
      where: { id: user.id },
      data: { billingStatus: 'expired' }
    });
  }
  return user;
}

/**
 * Access rules (F3):
 * - child → always
 * - web → always (Stripe/paywall never on web)
 * - mobile parent → trialing (in window) or active
 */
export function hasMobileAppAccess(user, platform) {
  if (!user) {
    return false;
  }
  if (user.role === 'child') {
    return true;
  }
  if (!isMobilePlatform(platform)) {
    return true;
  }
  if (user.billingStatus === 'trialing') {
    return Boolean(user.trialEndsAt && user.trialEndsAt.getTime() > Date.now());
  }
  if (user.billingStatus === 'active') {
    if (!user.currentPeriodEnd) {
      return true;
    }
    return user.currentPeriodEnd.getTime() > Date.now();
  }
  return false;
}

export function billingPublicFields(user) {
  return {
    billingStatus: user.billingStatus ?? 'none',
    trialStartedAt: user.trialStartedAt
      ? user.trialStartedAt.toISOString()
      : null,
    trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
    currentPeriodEnd: user.currentPeriodEnd
      ? user.currentPeriodEnd.toISOString()
      : null,
    billingSource: user.billingSource ?? null
  };
}

/**
 * Start 30-day mobile trial once (from billingStatus none).
 * Does not restart after expired/canceled — that requires Stripe (later).
 */
export async function startMobileTrial(userId) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { error: 'not_found', status: 404 };
  }
  if (existing.role === 'child') {
    return { error: 'child_not_billable', status: 403 };
  }

  let user = await refreshUserBillingStatus(existing);

  if (user.billingStatus === 'trialing' || user.billingStatus === 'active') {
    return { user, started: false };
  }
  if (user.billingStatus === 'expired' || user.billingStatus === 'canceled') {
    return { error: 'trial_already_used', status: 409, user };
  }

  const startedAt = new Date();
  const endsAt = new Date(
    startedAt.getTime() + MOBILE_TRIAL_DAYS * 24 * 60 * 60 * 1000
  );

  user = await prisma.user.update({
    where: { id: userId },
    data: {
      billingStatus: 'trialing',
      trialStartedAt: startedAt,
      trialEndsAt: endsAt,
      billingSource: user.billingSource ?? 'manual'
    }
  });

  return { user, started: true };
}

export async function getEntitlementForUser(userId, platformRaw) {
  const platform = normalizeClientPlatform(platformRaw);
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { error: 'not_found', status: 404 };
  }
  const user = await refreshUserBillingStatus(existing);
  return {
    platform,
    accessAllowed: hasMobileAppAccess(user, platform),
    ...billingPublicFields(user),
    user
  };
}
