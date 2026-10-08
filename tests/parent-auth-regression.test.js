/**
 * Adult auth regression: register → parentB join → email/password login.
 * Ensures child-invite changes did not break the parent path.
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

const PASSWORD = 'ParentPass1!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe(
  'parent auth regression',
  { skip: !(await dbReady()) },
  () => {
    /** @type {import('node:http').Server} */
    let server;
    /** @type {string[]} */
    const workspaceIds = [];

    before(async () => {
      server = await listen(createApp());
    });

    after(async () => {
      for (const workspaceId of workspaceIds) {
        await prisma.session.deleteMany({
          where: { user: { workspaceId } }
        });
        await prisma.userConsent.deleteMany({
          where: { user: { workspaceId } }
        });
        await prisma.child.deleteMany({ where: { workspaceId } });
        await prisma.user.deleteMany({ where: { workspaceId } });
        await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
      }
      await new Promise((resolve) => server.close(resolve));
      await prisma.$disconnect();
    });

    it('register parentA, join parentB, login both with email+password', async () => {
      const stamp = `${Date.now()}-preg`;
      const emailA = `preg-a-${stamp}@test.coparentes.app`;
      const emailB = `preg-b-${stamp}@test.coparentes.app`;

      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Anna Regression',
          email: emailA,
          password: PASSWORD,
          workspaceName: `Regression ${stamp}`,
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      assert.equal(register.json.user.role, 'parentA');
      assert.ok(register.json.workspace.inviteCode);
      workspaceIds.push(register.json.workspace.id);

      const join = await request(server, 'POST', '/api/auth/join', {
        body: {
          name: 'Marek Regression',
          email: emailB,
          password: PASSWORD,
          inviteCode: register.json.workspace.inviteCode
        }
      });
      assert.equal(join.status, 201, JSON.stringify(join.json));
      assert.equal(join.json.user.role, 'parentB');
      assert.equal(join.json.workspace.id, register.json.workspace.id);

      const loginA = await request(server, 'POST', '/api/auth/login', {
        body: { email: emailA, password: PASSWORD }
      });
      assert.equal(loginA.status, 200, JSON.stringify(loginA.json));
      assert.equal(loginA.json.user.role, 'parentA');
      assert.ok(loginA.json.token);

      const loginB = await request(server, 'POST', '/api/auth/login', {
        body: { email: emailB, password: PASSWORD }
      });
      assert.equal(loginB.status, 200, JSON.stringify(loginB.json));
      assert.equal(loginB.json.user.role, 'parentB');
      assert.ok(loginB.json.token);

      const session = await request(server, 'GET', '/api/auth/session', {
        token: loginA.json.token
      });
      assert.equal(session.status, 200, JSON.stringify(session.json));
      assert.ok(session.json.workspace?.members?.length >= 2);
    });
  }
);
