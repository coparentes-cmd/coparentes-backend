/**
 * Per-child invite codes + child login (no e-mail).
 * Covers workshop decisions: unique code, DOB second factor, login+password+DOB.
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
const CHILD_PASSWORD = 'ChildLogin1!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe(
  'child invite code + login',
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

    it('unique codes, join by child code, login by name+DOB, wrong DOB rejected', async () => {
      const stamp = `${Date.now()}-cinv`;
      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Parent A',
          email: `cinv-pa-${stamp}@test.coparentes.app`,
          password: PARENT_PASSWORD,
          workspaceName: `Child Invite ${stamp}`,
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      workspaceIds.push(register.json.workspace.id);
      const parentToken = register.json.token;

      const sameDob = new Date(Date.UTC(2016, 4, 12)).toISOString();
      const addA = await request(server, 'POST', '/api/workspace/children', {
        token: parentToken,
        body: { name: 'Zosia A', dateOfBirth: sameDob }
      });
      const addB = await request(server, 'POST', '/api/workspace/children', {
        token: parentToken,
        body: { name: 'Basia B', dateOfBirth: sameDob }
      });
      assert.equal(addA.status, 201, JSON.stringify(addA.json));
      assert.equal(addB.status, 201, JSON.stringify(addB.json));
      assert.ok(addA.json.inviteCode);
      assert.ok(addB.json.inviteCode);
      assert.notEqual(addA.json.inviteCode, addB.json.inviteCode);

      const preview = await request(
        server,
        'GET',
        `/api/auth/join-preview?childInviteCode=${encodeURIComponent(addA.json.inviteCode)}`
      );
      assert.equal(preview.status, 200, JSON.stringify(preview.json));
      assert.equal(preview.json.children.length, 1);
      assert.equal(preview.json.children[0].id, addA.json.id);

      const wrongDob = await request(server, 'POST', '/api/auth/child/access', {
        body: {
          childInviteCode: addA.json.inviteCode,
          dateOfBirth: new Date(Date.UTC(2010, 0, 1)).toISOString(),
          password: CHILD_PASSWORD,
          name: 'Zosia'
        }
      });
      assert.equal(wrongDob.status, 400);
      assert.equal(wrongDob.json.error, 'child_dob_mismatch');

      const join = await request(server, 'POST', '/api/auth/child/access', {
        body: {
          childInviteCode: addA.json.inviteCode,
          dateOfBirth: sameDob,
          password: CHILD_PASSWORD,
          name: 'Zosia Login'
        }
      });
      assert.equal(join.status, 201, JSON.stringify(join.json));
      assert.equal(join.json.user.role, 'child');

      const login = await request(server, 'POST', '/api/auth/child/login', {
        body: {
          login: 'Zosia Login',
          password: CHILD_PASSWORD,
          dateOfBirth: sameDob
        }
      });
      assert.equal(login.status, 200, JSON.stringify(login.json));
      assert.equal(login.json.user.role, 'child');
      assert.equal(login.json.user.id, join.json.user.id);

      const badLogin = await request(server, 'POST', '/api/auth/child/login', {
        body: {
          login: 'Zosia Login',
          password: 'WrongPass1!',
          dateOfBirth: sameDob
        }
      });
      assert.equal(badLogin.status, 401);
      assert.equal(badLogin.json.error, 'invalid_credentials');
    });
  }
);
