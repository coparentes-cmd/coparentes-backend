/**
 * POST /api/workspace/children/:childId/delete requires parent password.
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

const PARENT_PASSWORD = 'ParentPass1!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe(
  'POST /api/workspace/children/:childId/delete password gate',
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

    async function registerWithChild() {
      const stamp = `${Date.now()}-del`;
      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Parent A',
          email: `del-pa-${stamp}@test.coparentes.app`,
          password: PARENT_PASSWORD,
          workspaceName: `Del Family ${stamp}`,
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      workspaceIds.push(register.json.workspace.id);
      const token = register.json.token;

      const addChild = await request(server, 'POST', '/api/workspace/children', {
        token,
        body: {
          name: 'Basia',
          dateOfBirth: new Date(Date.UTC(2013, 6, 24)).toISOString()
        }
      });
      assert.equal(addChild.status, 201, JSON.stringify(addChild.json));
      return { token, childId: addChild.json.id };
    }

    it('rejects delete without password body', async () => {
      const { token, childId } = await registerWithChild();
      const res = await request(
        server,
        'POST',
        `/api/workspace/children/${childId}/delete`,
        { token, body: {} }
      );
      assert.equal(res.status, 400, JSON.stringify(res.json));
      assert.equal(res.json.error, 'invalid_request');
    });

    it('rejects delete with wrong password', async () => {
      const { token, childId } = await registerWithChild();
      const res = await request(
        server,
        'POST',
        `/api/workspace/children/${childId}/delete`,
        { token, body: { password: 'WrongPass1!' } }
      );
      assert.equal(res.status, 401, JSON.stringify(res.json));
      assert.equal(res.json.error, 'invalid_credentials');
    });

    it('deletes child when password is correct', async () => {
      const { token, childId } = await registerWithChild();
      const res = await request(
        server,
        'POST',
        `/api/workspace/children/${childId}/delete`,
        { token, body: { password: PARENT_PASSWORD } }
      );
      assert.equal(res.status, 204, JSON.stringify(res.json));

      const graph = await request(server, 'GET', '/api/workspace/current', {
        token
      });
      assert.equal(graph.status, 200);
      assert.equal(
        graph.json.children.some((c) => c.id === childId),
        false
      );
    });
  }
);
