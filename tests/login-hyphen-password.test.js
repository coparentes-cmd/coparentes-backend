/**
 * Login must preserve intentional password characters (- _ . space).
 * Regression: unconditional strip in loginUser broke passwords like "Test-Password123".
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

const HYPHEN_PASSWORD = 'Test-Password123';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: true,
  MARKETING: false,
  ANALYTICS: false
};

describe('Login with hyphen in password', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string | null} */
  let workspaceId = null;
  /** @type {string} */
  let email;

  before(async () => {
    server = await listen(createApp());
    email = `hyphen-login-${Date.now()}@test.coparentes.app`;
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

  it('registers and logs in with password containing a hyphen', async () => {
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Hyphen User',
        email,
        password: HYPHEN_PASSWORD,
        workspaceName: 'Hyphen Family',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    workspaceId = register.json.workspace.id;

    const login = await request(server, 'POST', '/api/auth/login', {
      body: {
        email,
        password: HYPHEN_PASSWORD
      }
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    assert.ok(login.json.token);
    assert.equal(login.json.user.email, email);
  });
});
