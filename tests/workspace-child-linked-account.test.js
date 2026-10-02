/**
 * serializeChild / getWorkspaceGraph expose linkedAccountId (User.id) when a
 * child profile has completed accessChildAccount; null before that.
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
  'workspace.children linkedAccountId',
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

    it('child without account → linkedAccountId null; after access → User.id', async () => {
      const stamp = `${Date.now()}-link`;
      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Parent A',
          email: `link-pa-${stamp}@test.coparentes.app`,
          password: PARENT_PASSWORD,
          workspaceName: `Link Family ${stamp}`,
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      const workspaceId = register.json.workspace.id;
      workspaceIds.push(workspaceId);
      const parentToken = register.json.token;

      const dob = new Date(Date.UTC(2015, 2, 15)).toISOString();
      const addChild = await request(server, 'POST', '/api/workspace/children', {
        token: parentToken,
        body: { name: 'Ola Testowa', dateOfBirth: dob }
      });
      assert.equal(addChild.status, 201, JSON.stringify(addChild.json));
      assert.equal(addChild.json.linkedAccountId, null);
      const childProfileId = addChild.json.id;

      const beforeAccess = await request(server, 'GET', '/api/workspace/current', {
        token: parentToken
      });
      assert.equal(beforeAccess.status, 200, JSON.stringify(beforeAccess.json));
      const childBefore = beforeAccess.json.children.find((c) => c.id === childProfileId);
      assert.ok(childBefore, 'child profile present in workspace graph');
      assert.equal(childBefore.linkedAccountId, null);
      assert.ok(childBefore.id);
      assert.ok(childBefore.name);
      assert.ok(childBefore.dateOfBirth);
      assert.equal('school' in childBefore, true);

      const childAccess = await request(server, 'POST', '/api/auth/child/access', {
        body: {
          childInviteCode: register.json.workspace.childInviteCode,
          dateOfBirth: dob,
          password: CHILD_PASSWORD,
          name: 'Ola'
        }
      });
      assert.equal(childAccess.status, 201, JSON.stringify(childAccess.json));
      const childUserId = childAccess.json.user.id;
      assert.ok(childUserId);

      const afterAccess = await request(server, 'GET', '/api/workspace/current', {
        token: parentToken
      });
      assert.equal(afterAccess.status, 200, JSON.stringify(afterAccess.json));
      const childAfter = afterAccess.json.children.find((c) => c.id === childProfileId);
      assert.ok(childAfter);
      assert.equal(childAfter.linkedAccountId, childUserId);
    });
  }
);
