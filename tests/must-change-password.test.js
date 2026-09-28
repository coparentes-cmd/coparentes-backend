/**
 * After forgot-password, mustChangePassword stays true until POST /auth/password.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';
process.env.OTP_ENABLED = 'false';
process.env.MAILER_STUB_SUCCESS = 'true';
process.env.RESEND_API_KEY ??= 're_test_stub_key';
process.env.RESEND_FROM_EMAIL ??= 'Coparentes <noreply@test.coparentes.app>';

import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';
import { prisma } from '../src/lib/prisma.js';
import { getStubLastTempPassword } from '../src/utils/mailer.js';

const INITIAL_PASSWORD = 'Initial1!';
const NEW_PASSWORD = 'Changed9!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('mustChangePassword after forgot-password', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string | null} */
  let workspaceId = null;
  /** @type {string} */
  let email;

  before(async () => {
    server = await listen(createApp());
    email = `must-change-${Date.now()}@test.coparentes.app`;
  });

  after(async () => {
    server?.close();
    if (workspaceId) {
      await prisma.session.deleteMany({
        where: { user: { workspaceId } }
      });
      await prisma.userConsent.deleteMany({
        where: { user: { workspaceId } }
      });
      await prisma.user.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('forgot → login flag true → change password → session flag false', async () => {
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Must Change User',
        email,
        password: INITIAL_PASSWORD,
        workspaceName: 'Must Change Family',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    workspaceId = register.json.workspace.id;
    assert.equal(register.json.user.mustChangePassword, false);

    const forgot = await request(server, 'POST', '/api/auth/forgot-password', {
      body: { email }
    });
    assert.equal(forgot.status, 200, JSON.stringify(forgot.json));
    assert.equal(forgot.json.success, true);

    const row = await prisma.user.findUnique({
      where: { email },
      select: { mustChangePassword: true }
    });
    assert.equal(row?.mustChangePassword, true);

    const tempPassword = getStubLastTempPassword();
    assert.ok(tempPassword && /^\d{12}$/.test(tempPassword), 'stub captured 12-digit temp password');

    const login = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: tempPassword }
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    assert.equal(login.json.user.mustChangePassword, true);
    const token = login.json.token;
    assert.ok(token);

    const change = await request(server, 'POST', '/api/auth/password', {
      headers: { Authorization: `Bearer ${token}` },
      body: {
        currentPassword: tempPassword,
        newPassword: NEW_PASSWORD
      }
    });
    assert.equal(change.status, 200, JSON.stringify(change.json));

    const afterChange = await prisma.user.findUnique({
      where: { email },
      select: { mustChangePassword: true }
    });
    assert.equal(afterChange?.mustChangePassword, false);

    // changePassword invalidates sessions — login again with new password
    const login2 = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: NEW_PASSWORD }
    });
    assert.equal(login2.status, 200, JSON.stringify(login2.json));
    assert.equal(login2.json.user.mustChangePassword, false);

    const session = await request(server, 'GET', '/api/auth/session', {
      headers: { Authorization: `Bearer ${login2.json.token}` }
    });
    assert.equal(session.status, 200, JSON.stringify(session.json));
    assert.equal(session.json.user.mustChangePassword, false);
  });
});
