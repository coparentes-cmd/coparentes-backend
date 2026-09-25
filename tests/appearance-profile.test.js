/**
 * Appearance prefs on PATCH /api/auth/profile (themeMode, colorScheme).
 * Mirrors the live prod check: PATCH → response → GET /session → DB truth.
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

const PASSWORD = 'AppearancePrefs99!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('Appearance profile prefs', { skip: !(await dbReady()) }, () => {
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
      await prisma.session.deleteMany({
        where: { user: { email: { in: testEmails } } }
      });
      await prisma.userConsent.deleteMany({
        where: { user: { email: { in: testEmails } } }
      });
      const users = await prisma.user.findMany({
        where: { email: { in: testEmails } },
        select: { id: true, workspaceId: true }
      });
      const workspaceIds = [
        ...new Set(users.map((u) => u.workspaceId).filter(Boolean))
      ];
      await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
      if (workspaceIds.length > 0) {
        await prisma.workspace.deleteMany({
          where: { id: { in: workspaceIds } }
        });
      }
    }
    await prisma.$disconnect();
  });

  async function registerProbe() {
    const email = `appearance-${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}@test.coparentes.app`;
    testEmails.push(email);
    const res = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Appearance Probe',
        email,
        password: PASSWORD,
        workspaceName: 'Appearance Probe WS',
        consents
      }
    });
    assert.equal(res.status, 201, res.raw);
    assert.ok(res.json?.token);
    return { email, token: res.json.token, user: res.json.user };
  }

  it('new user defaults to themeMode light and colorScheme teal', async () => {
    const { user, token } = await registerProbe();
    assert.equal(user.themeMode, 'light');
    assert.equal(user.colorScheme, 'teal');

    const session = await request(server, 'GET', '/api/auth/session', {
      token
    });
    assert.equal(session.status, 200);
    assert.equal(session.json.user.themeMode, 'light');
    assert.equal(session.json.user.colorScheme, 'teal');

    const row = await prisma.user.findUnique({
      where: { email: user.email },
      select: { themeMode: true, colorScheme: true }
    });
    assert.equal(row.themeMode, 'light');
    assert.equal(row.colorScheme, 'teal');
  });

  it('PATCH themeMode dark persists through GET /session and DB', async () => {
    const { token, user } = await registerProbe();

    const patch = await request(server, 'PATCH', '/api/auth/profile', {
      token,
      body: { themeMode: 'dark' }
    });
    assert.equal(patch.status, 200, patch.raw);
    assert.equal(patch.json.user.themeMode, 'dark');
    assert.equal(patch.json.user.colorScheme, 'teal');

    const session = await request(server, 'GET', '/api/auth/session', {
      token
    });
    assert.equal(session.status, 200);
    assert.equal(session.json.user.themeMode, 'dark');
    assert.equal(session.json.user.colorScheme, 'teal');

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { themeMode: true, colorScheme: true }
    });
    assert.equal(row.themeMode, 'dark');
    assert.equal(row.colorScheme, 'teal');
  });

  it('PATCH colorScheme rose persists through GET /session and DB', async () => {
    const { token, user } = await registerProbe();

    const patch = await request(server, 'PATCH', '/api/auth/profile', {
      token,
      body: { colorScheme: 'rose' }
    });
    assert.equal(patch.status, 200, patch.raw);
    assert.equal(patch.json.user.colorScheme, 'rose');
    assert.equal(patch.json.user.themeMode, 'light');

    const session = await request(server, 'GET', '/api/auth/session', {
      token
    });
    assert.equal(session.status, 200);
    assert.equal(session.json.user.colorScheme, 'rose');
    assert.equal(session.json.user.themeMode, 'light');

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { themeMode: true, colorScheme: true }
    });
    assert.equal(row.colorScheme, 'rose');
    assert.equal(row.themeMode, 'light');
  });

  it('invalid colorScheme returns 400 and leaves DB unchanged', async () => {
    const { token, user } = await registerProbe();

    const before = await prisma.user.findUnique({
      where: { id: user.id },
      select: { themeMode: true, colorScheme: true }
    });

    const patch = await request(server, 'PATCH', '/api/auth/profile', {
      token,
      body: { colorScheme: 'purple123' }
    });
    assert.equal(patch.status, 400);
    assert.equal(patch.json.error, 'invalid_request');

    const session = await request(server, 'GET', '/api/auth/session', {
      token
    });
    assert.equal(session.status, 200);
    assert.equal(session.json.user.themeMode, before.themeMode);
    assert.equal(session.json.user.colorScheme, before.colorScheme);

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { themeMode: true, colorScheme: true }
    });
    assert.deepEqual(after, before);
  });
});
