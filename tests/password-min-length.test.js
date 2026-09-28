/**
 * Password minimum length: register accepts 8, rejects 7.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';
process.env.OTP_ENABLED = 'false';

import { PASSWORD_MIN_LENGTH } from '../src/utils/passwordPolicy.js';
import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';
import { prisma } from '../src/lib/prisma.js';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('Password min length policy', () => {
  it('exports PASSWORD_MIN_LENGTH = 8', () => {
    assert.equal(PASSWORD_MIN_LENGTH, 8);
  });
});

describe('Password min length (register API)', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string | null} */
  let testWorkspaceId = null;

  before(async () => {
    server = await listen(createApp());
  });

  after(async () => {
    server?.close();
    if (testWorkspaceId) {
      await prisma.session.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.userConsent.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.user.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.workspace.delete({ where: { id: testWorkspaceId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('register with 8-char password → 201', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const password8 = 'Abcdef1!'; // exactly 8
    assert.equal(password8.length, PASSWORD_MIN_LENGTH);

    const res = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Pass Min Eight',
        email: `pass-min8-${id}@test.coparentes.app`,
        password: password8,
        workspaceName: 'Rodzina Pass Min',
        consents
      }
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    testWorkspaceId = res.json.workspace.id;
  });

  it('register with 7-char password → 400 invalid_request', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const password7 = 'Abcde1!'; // 7
    assert.equal(password7.length, PASSWORD_MIN_LENGTH - 1);

    const res = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Pass Min Seven',
        email: `pass-min7-${id}@test.coparentes.app`,
        password: password7,
        workspaceName: 'Rodzina Pass Min7',
        consents
      }
    });
    assert.equal(res.status, 400, JSON.stringify(res.json));
    assert.equal(res.json.error, 'invalid_request');
  });
});
