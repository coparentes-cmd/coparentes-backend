import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prisma } from '../lib/prisma.js';

const require = createRequire(import.meta.url);

/**
 * Device push tokens + FCM send via firebase-admin.
 * Without FIREBASE_SERVICE_ACCOUNT_JSON / FILE: soft-fail (log stub), never throw.
 */

/** Resolve service-account JSON from env (inline) or file path. */
function readServiceAccountRaw() {
  const inline = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (inline) {
    return inline;
  }
  const file = String(process.env.FIREBASE_SERVICE_ACCOUNT_FILE || '').trim();
  if (!file) {
    return '';
  }
  try {
    return readFileSync(file, 'utf8');
  } catch (err) {
    console.error('[push] FIREBASE_SERVICE_ACCOUNT_FILE unreadable', {
      file,
      message: err instanceof Error ? err.message : String(err)
    });
    return '';
  }
}

/** @type {import('firebase-admin').app.App | null | undefined} */
let adminApp;
/** @type {boolean} */
let initAttempted = false;

/** Test-only: clear cached firebase-admin init so env changes are re-read. */
export function __resetFirebaseAdminForTests() {
  adminApp = undefined;
  initAttempted = false;
}

/**
 * @returns {import('firebase-admin').messaging.Messaging | null}
 */
function getMessagingOrNull() {
  if (initAttempted) {
    return adminApp ? adminApp.messaging() : null;
  }
  initAttempted = true;

  const raw = readServiceAccountRaw();
  if (!raw) {
    console.info(
      '[push] FIREBASE_SERVICE_ACCOUNT_JSON/FILE missing — send stays stubbed'
    );
    adminApp = null;
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    const admin = require('firebase-admin');
    if (admin.apps.length > 0) {
      adminApp = admin.app();
    } else {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    return adminApp.messaging();
  } catch (err) {
    console.error('[push] firebase-admin init failed — send stays stubbed', {
      message: err instanceof Error ? err.message : String(err)
    });
    adminApp = null;
    return null;
  }
}

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
 * Send a notification to all registered devices for a user.
 * Soft-fails (stub log) when Firebase is not configured or FCM errors.
 *
 * @param {{ userId: string, title: string, body: string, data?: Record<string, string> }} input
 * @returns {Promise<{ attempted: number, stubbed: boolean, successCount?: number, failureCount?: number }>}
 */
export async function sendPushToUser({ userId, title, body, data }) {
  const tokens = await prisma.devicePushToken.findMany({
    where: { userId },
    select: { token: true, platform: true }
  });

  if (tokens.length === 0) {
    console.info('[push] no tokens', { userId, title });
    return { attempted: 0, stubbed: false };
  }

  const messaging = getMessagingOrNull();
  if (!messaging) {
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

  const registrationTokens = tokens.map((row) => row.token);
  const message = {
    tokens: registrationTokens,
    notification: { title, body },
    data: data ?? undefined,
    apns: {
      payload: {
        aps: {
          sound: 'default'
        }
      }
    }
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    const failures = response.responses
      .map((r, i) =>
        r.success
          ? null
          : {
              tokenPrefix: `${registrationTokens[i].slice(0, 12)}…`,
              code: r.error?.code,
              message: r.error?.message
            }
      )
      .filter(Boolean);
    console.info('[push] fcm multicast', {
      userId,
      attempted: registrationTokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      failures: failures.length ? failures : undefined
    });
    return {
      attempted: registrationTokens.length,
      stubbed: false,
      successCount: response.successCount,
      failureCount: response.failureCount,
      failures: failures.length ? failures : undefined
    };
  } catch (err) {
    console.error('[push] fcm send failed', {
      userId,
      message: err instanceof Error ? err.message : String(err)
    });
    return {
      attempted: registrationTokens.length,
      stubbed: false,
      successCount: 0,
      failureCount: registrationTokens.length
    };
  }
}
