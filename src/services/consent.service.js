import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../utils/env.js';

export const CONSENT_VERSION = '1.0.0';

export const ALL_CONSENT_TYPES = [
  'TERMS',
  'DATA_PROCESSING',
  'CHILD_DATA',
  'EMAIL_NOTIFICATIONS',
  'MARKETING',
  'ANALYTICS'
];

export const REQUIRED_CONSENT_TYPES = ['TERMS', 'DATA_PROCESSING', 'CHILD_DATA'];

export const OPTIONAL_CONSENT_TYPES = [
  'EMAIL_NOTIFICATIONS',
  'MARKETING',
  'ANALYTICS'
];

export function hashIpAddress(ipAddress) {
  const normalized = (ipAddress ?? 'unknown').trim() || 'unknown';
  const secret = env.integritySecret || 'coparentes-consent-fallback';
  return createHash('sha256').update(`${normalized}:${secret}`).digest('hex');
}

export function validateRequiredConsents(consents) {
  if (!consents || typeof consents !== 'object') {
    return { ok: false, error: 'required_consents_missing' };
  }

  for (const type of REQUIRED_CONSENT_TYPES) {
    if (consents[type] !== true) {
      return { ok: false, error: 'required_consents_missing' };
    }
  }

  return { ok: true };
}

export function normalizeConsentsPayload(consents) {
  const normalized = {};
  for (const type of ALL_CONSENT_TYPES) {
    normalized[type] = consents?.[type] === true;
  }
  return normalized;
}

export async function saveRegistrationConsents({
  userId,
  consents,
  ipAddress,
  client = prisma
}) {
  const now = new Date();
  const ipAddressHash = hashIpAddress(ipAddress);
  const normalized = normalizeConsentsPayload(consents);

  await client.userConsent.createMany({
    data: ALL_CONSENT_TYPES.map((consentType) => ({
      userId,
      consentType,
      granted: normalized[consentType],
      grantedAt: now,
      ipAddressHash,
      consentVersion: CONSENT_VERSION,
      revokedAt: null
    }))
  });
}

export async function getCurrentUserConsents(userId) {
  const rows = await prisma.userConsent.findMany({
    where: { userId },
    orderBy: [{ consentType: 'asc' }, { grantedAt: 'desc' }]
  });

  const latestByType = new Map();
  for (const row of rows) {
    if (!latestByType.has(row.consentType)) {
      latestByType.set(row.consentType, row);
    }
  }

  return ALL_CONSENT_TYPES.map((consentType) => {
    const row = latestByType.get(consentType);
    return {
      consentType,
      granted: row?.granted ?? false,
      grantedAt: row?.grantedAt?.toISOString() ?? null,
      revokedAt: row?.revokedAt?.toISOString() ?? null,
      consentVersion: row?.consentVersion ?? CONSENT_VERSION,
      required: REQUIRED_CONSENT_TYPES.includes(consentType)
    };
  });
}

export async function updateUserConsent({
  userId,
  consentType,
  granted,
  ipAddress
}) {
  if (!ALL_CONSENT_TYPES.includes(consentType)) {
    return { error: 'invalid_consent_type' };
  }

  if (REQUIRED_CONSENT_TYPES.includes(consentType) && granted === false) {
    return { error: 'required_consent_locked' };
  }

  const now = new Date();
  const ipAddressHash = hashIpAddress(ipAddress);

  const row = await prisma.userConsent.create({
    data: {
      userId,
      consentType,
      granted,
      grantedAt: now,
      ipAddressHash,
      consentVersion: CONSENT_VERSION,
      revokedAt: granted ? null : now
    }
  });

  return {
    consent: {
      consentType: row.consentType,
      granted: row.granted,
      grantedAt: row.grantedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      consentVersion: row.consentVersion,
      required: REQUIRED_CONSENT_TYPES.includes(row.consentType)
    }
  };
}
