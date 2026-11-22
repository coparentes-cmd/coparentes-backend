/**
 * F2b: behavior that device-push-token.test.js does not cover —
 * multi-device, reassignment, android, validation edges, internal test-send,
 * soft-fail on bad Firebase JSON, empty-token send.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';
process.env.OTP_ENABLED = 'false';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'f2b-test-cron-secret';

import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';
import { prisma } from '../src/lib/prisma.js';
import {
  sendPushToUser,
  __resetFirebaseAdminForTests
} from '../src/services/push.service.js';

const PASSWORD = 'PushTokenTest99!';
const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('F2b push behavior', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string[]} */
  const testEmails = [];

  before(async () => {
    server = await listen(createApp());
  });

  after(async () => {
    server?.close();
    if (testEmails.length > 0) {
      const users = await prisma.user.findMany({
        where: { email: { in: testEmails } },
        select: { id: true, workspaceId: true }
      });
      const userIds = users.map((u) => u.id);
      const workspaceIds = [
        ...new Set(users.map((u) => u.workspaceId).filter(Boolean))
      ];
      if (userIds.length > 0) {
        await prisma.devicePushToken.deleteMany({
          where: { userId: { in: userIds } }
        });
        await prisma.session.deleteMany({
          where: { userId: { in: userIds } }
        });
        await prisma.userConsent.deleteMany({
          where: { userId: { in: userIds } }
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (workspaceIds.length > 0) {
        await prisma.workspace.deleteMany({
          where: { id: { in: workspaceIds } }
        });
      }
    }
    await prisma.$disconnect();
  });

  async function registerProbe(label = 'probe') {
    const email = `f2b-${label}-${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}@test.coparentes.app`;
    testEmails.push(email);
    const res = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: `F2b ${label}`,
        email,
        password: PASSWORD,
        workspaceName: `F2b ${label} WS`,
        consents
      }
    });
    assert.equal(res.status, 201, res.raw);
    return { email, token: res.json.token, user: res.json.user };
  }

  function fcm(tag) {
    return `fcm-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}-abcdefgh`;
  }

  it('registers android token and keeps platform', async () => {
    const { token, user } = await registerProbe('android');
    const device = fcm('android');
    const res = await request(server, 'POST', '/api/user/push-token', {
      token,
      body: { token: device, platform: 'android' }
    });
    assert.equal(res.status, 200, res.raw);
    assert.equal(res.json.platform, 'android');
    const row = await prisma.devicePushToken.findUnique({
      where: { token: device }
    });
    assert.equal(row?.userId, user.id);
    assert.equal(row?.platform, 'android');
  });

  it('rejects token shorter than 8 chars', async () => {
    const { token } = await registerProbe('short');
    const res = await request(server, 'POST', '/api/user/push-token', {
      token,
      body: { token: 'short', platform: 'ios' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'invalid_request');
  });

  it('DELETE without body clears all devices for that user only', async () => {
    const a = await registerProbe('multi-a');
    const b = await registerProbe('multi-b');
    const a1 = fcm('a1');
    const a2 = fcm('a2');
    const b1 = fcm('b1');

    for (const device of [a1, a2]) {
      const res = await request(server, 'POST', '/api/user/push-token', {
        token: a.token,
        body: { token: device, platform: 'ios' }
      });
      assert.equal(res.status, 200, res.raw);
    }
    const bRes = await request(server, 'POST', '/api/user/push-token', {
      token: b.token,
      body: { token: b1, platform: 'ios' }
    });
    assert.equal(bRes.status, 200, bRes.raw);

    const cleared = await request(server, 'DELETE', '/api/user/push-token', {
      token: a.token,
      body: {}
    });
    assert.equal(cleared.status, 200, cleared.raw);
    assert.equal(cleared.json.deleted, 2);

    assert.equal(
      await prisma.devicePushToken.count({ where: { userId: a.user.id } }),
      0
    );
    assert.equal(
      await prisma.devicePushToken.count({ where: { userId: b.user.id } }),
      1
    );
  });

  it('reassigns the same FCM token to a second user on upsert', async () => {
    const first = await registerProbe('reassign-1');
    const second = await registerProbe('reassign-2');
    const shared = fcm('shared');

    const one = await request(server, 'POST', '/api/user/push-token', {
      token: first.token,
      body: { token: shared, platform: 'ios' }
    });
    assert.equal(one.status, 200, one.raw);

    const two = await request(server, 'POST', '/api/user/push-token', {
      token: second.token,
      body: { token: shared, platform: 'android' }
    });
    assert.equal(two.status, 200, two.raw);
    assert.equal(two.json.id, one.json.id);

    const row = await prisma.devicePushToken.findUnique({
      where: { token: shared }
    });
    assert.equal(row.userId, second.user.id);
    assert.equal(row.platform, 'android');
    assert.equal(
      await prisma.devicePushToken.count({ where: { userId: first.user.id } }),
      0
    );
  });

  it('sendPushToUser with no tokens returns attempted 0 without stubbing', async () => {
    const { user } = await registerProbe('empty-send');
    __resetFirebaseAdminForTests();
    const result = await sendPushToUser({
      userId: user.id,
      title: 'Nobody',
      body: 'No devices'
    });
    assert.deepEqual(result, { attempted: 0, stubbed: false });
  });

  it('invalid FIREBASE_SERVICE_ACCOUNT_JSON soft-fails (stub, no throw)', async () => {
    const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const prevFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{not-json';
    delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    __resetFirebaseAdminForTests();

    try {
      const { token, user } = await registerProbe('bad-json');
      const device = fcm('badjson');
      await request(server, 'POST', '/api/user/push-token', {
        token,
        body: { token: device, platform: 'ios' }
      });

      const result = await sendPushToUser({
        userId: user.id,
        title: 'Bad JSON',
        body: 'should stub'
      });
      assert.equal(result.attempted, 1);
      assert.equal(result.stubbed, true);
    } finally {
      __resetFirebaseAdminForTests();
      if (prevJson !== undefined) {
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
      } else {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      }
      if (prevFile !== undefined) {
        process.env.FIREBASE_SERVICE_ACCOUNT_FILE = prevFile;
      } else {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
      }
    }
  });

  it('internal test-send requires cron secret and userId', async () => {
    const { token, user } = await registerProbe('internal');
    const device = fcm('internal');
    await request(server, 'POST', '/api/user/push-token', {
      token,
      body: { token: device, platform: 'ios' }
    });

    const noAuth = await request(server, 'POST', '/api/internal/push/test-send', {
      body: { userId: user.id }
    });
    assert.equal(noAuth.status, 401);

    const noUser = await request(server, 'POST', '/api/internal/push/test-send', {
      headers: { 'X-Cron-Secret': process.env.CRON_SECRET },
      body: { title: 'x' }
    });
    assert.equal(noUser.status, 400);
    assert.equal(noUser.json.error, 'invalid_request');

    const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const prevFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    __resetFirebaseAdminForTests();

    try {
      const ok = await request(server, 'POST', '/api/internal/push/test-send', {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: { userId: user.id, title: 'F2b', body: 'internal smoke' }
      });
      assert.equal(ok.status, 200, ok.raw);
      assert.equal(ok.json.ok, true);
      assert.equal(ok.json.attempted, 1);
      assert.equal(ok.json.stubbed, true);
    } finally {
      __resetFirebaseAdminForTests();
      if (prevJson !== undefined) {
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
      } else {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      }
      if (prevFile !== undefined) {
        process.env.FIREBASE_SERVICE_ACCOUNT_FILE = prevFile;
      } else {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
      }
    }
  });

  it('send covers both ios and android tokens for one user', async () => {
    const { token, user } = await registerProbe('multi-platform');
    const ios = fcm('ios-mp');
    const android = fcm('android-mp');
    await request(server, 'POST', '/api/user/push-token', {
      token,
      body: { token: ios, platform: 'ios' }
    });
    await request(server, 'POST', '/api/user/push-token', {
      token,
      body: { token: android, platform: 'android' }
    });

    const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const prevFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    __resetFirebaseAdminForTests();

    try {
      const result = await sendPushToUser({
        userId: user.id,
        title: 'Both',
        body: 'ios+android',
        data: { type: 'multi' }
      });
      assert.equal(result.attempted, 2);
      assert.equal(result.stubbed, true);
    } finally {
      __resetFirebaseAdminForTests();
      if (prevJson !== undefined) {
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
      } else {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      }
      if (prevFile !== undefined) {
        process.env.FIREBASE_SERVICE_ACCOUNT_FILE = prevFile;
      } else {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
      }
    }
  });
});
