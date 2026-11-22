/**
 * F2a: DevicePushToken register / delete API.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';
process.env.OTP_ENABLED = 'false';

import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';
import { prisma } from '../src/lib/prisma.js';

const PASSWORD = 'PushTokenTest99!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('Device push token API', { skip: !(await dbReady()) }, () => {
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

  async function registerProbe() {
    const email = `push-${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}@test.coparentes.app`;
    testEmails.push(email);
    const res = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Push Probe',
        email,
        password: PASSWORD,
        workspaceName: 'Push Probe WS',
        consents
      }
    });
    assert.equal(res.status, 201, res.raw);
    assert.ok(res.json?.token);
    return { email, token: res.json.token, user: res.json.user };
  }

  it('rejects unauthenticated push-token POST', async () => {
    const res = await request(server, 'POST', '/api/user/push-token', {
      body: { token: 'fcm-test-token-abcdefgh', platform: 'ios' }
    });
    assert.equal(res.status, 401);
  });

  it('upserts ios token then deletes it', async () => {
    const { token, user } = await registerProbe();
    const fcm = `fcm-ios-${Date.now()}-abcdefghijklmnopqrstuvwxyz`;

    const created = await request(server, 'POST', '/api/user/push-token', {
      token,
      body: { token: fcm, platform: 'ios' }
    });
    assert.equal(created.status, 200, created.raw);
    assert.equal(created.json.platform, 'ios');
    assert.ok(created.json.id);

    const row = await prisma.devicePushToken.findUnique({
      where: { token: fcm }
    });
    assert.ok(row);
    assert.equal(row.userId, user.id);
    assert.equal(row.platform, 'ios');

    const again = await request(server, 'POST', '/api/user/push-token', {
      token,
      body: { token: fcm, platform: 'ios' }
    });
    assert.equal(again.status, 200, again.raw);
    assert.equal(again.json.id, created.json.id);

    const deleted = await request(server, 'DELETE', '/api/user/push-token', {
      token,
      body: { token: fcm }
    });
    assert.equal(deleted.status, 200, deleted.raw);
    assert.equal(deleted.json.deleted, 1);

    const gone = await prisma.devicePushToken.findUnique({
      where: { token: fcm }
    });
    assert.equal(gone, null);
  });

  it('rejects invalid platform', async () => {
    const { token } = await registerProbe();
    const res = await request(server, 'POST', '/api/user/push-token', {
      token,
      body: { token: 'fcm-bad-platform-abcdefgh', platform: 'web' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'invalid_request');
  });

  it('sendPushToUser stubs without FIREBASE_SERVICE_ACCOUNT_JSON', async () => {
    const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const prevFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;

    const {
      sendPushToUser,
      __resetFirebaseAdminForTests
    } = await import('../src/services/push.service.js');
    __resetFirebaseAdminForTests();

    try {
      const { token, user } = await registerProbe();
      const fcm = `fcm-stub-${Date.now()}-abcdefghijklmnopqrstuvwxyz`;

      await request(server, 'POST', '/api/user/push-token', {
        token,
        body: { token: fcm, platform: 'ios' }
      });

      const result = await sendPushToUser({
        userId: user.id,
        title: 'Stub',
        body: 'No Firebase env'
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
});
