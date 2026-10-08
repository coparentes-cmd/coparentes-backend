/**
 * Parent-initiated child login-password reset:
 * POST /api/workspace/children/:childUserId/reset-password
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

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
import {
  getStubLastPasswordResetToken,
  getStubLastPasswordResetRecipients
} from '../src/utils/mailer.js';
import {
  createToken,
  hashPasswordResetToken
} from '../src/utils/security.js';
import { createSessionForUser } from '../src/services/session.js';
import { resetWorkspaceRateLimitersForTests } from '../src/routes/workspace.js';

const CHILD_PASSWORD = 'ChildLogin1!';
const NEW_CHILD_PASSWORD = 'ChildNewPass9!';
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
  'POST /api/workspace/children/:childUserId/reset-password',
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
        await prisma.passwordResetToken.deleteMany({
          where: { user: { workspaceId } }
        });
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

    beforeEach(async () => {
      await resetWorkspaceRateLimitersForTests();
    });

    async function registerFamily({ stamp, withParentB = true }) {
      const parentAEmail = `cpr-pa-${stamp}@test.coparentes.app`;
      const parentBEmail = `cpr-pb-${stamp}@test.coparentes.app`;

      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Parent A',
          email: parentAEmail,
          password: PARENT_PASSWORD,
          workspaceName: `CPR Family ${stamp}`,
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      const workspaceId = register.json.workspace.id;
      workspaceIds.push(workspaceId);

      let parentBToken = null;
      if (withParentB) {
        const joinB = await request(server, 'POST', '/api/auth/join', {
          body: {
            inviteCode: register.json.workspace.inviteCode,
            name: 'Parent B',
            email: parentBEmail,
            password: PARENT_PASSWORD
          }
        });
        assert.equal(joinB.status, 201, JSON.stringify(joinB.json));
        parentBToken = joinB.json.token;
      }

      const dob = new Date(Date.UTC(2014, 4, 10)).toISOString();
      const addChild = await request(server, 'POST', '/api/workspace/children', {
        token: register.json.token,
        body: { name: 'Basia Testowa', dateOfBirth: dob }
      });
      assert.equal(addChild.status, 201, JSON.stringify(addChild.json));

      assert.ok(addChild.json.inviteCode, 'child inviteCode required');
      const childInviteCode = addChild.json.inviteCode;

      const childAccess = await request(server, 'POST', '/api/auth/child/access', {
        body: {
          childInviteCode,
          dateOfBirth: dob,
          password: CHILD_PASSWORD,
          name: 'Basia'
        }
      });
      assert.equal(childAccess.status, 201, JSON.stringify(childAccess.json));

      return {
        workspaceId,
        parentAEmail,
        parentBEmail,
        parentAToken: register.json.token,
        parentBToken,
        childInviteCode,
        dob,
        childUserId: childAccess.json.user.id,
        childToken: childAccess.json.token,
        childEmail: childAccess.json.user.email
      };
    }

    it('parentA resets child password: 200, mail to both parents, old token invalidated', async () => {
      const family = await registerFamily({ stamp: `${Date.now()}-pa` });

      const staleRaw = createToken();
      const stale = await prisma.passwordResetToken.create({
        data: {
          tokenHash: hashPasswordResetToken(staleRaw),
          userId: family.childUserId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      });

      const res = await request(
        server,
        'POST',
        `/api/workspace/children/${family.childUserId}/reset-password`,
        { token: family.parentAToken }
      );
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.success, true);

      const recipients = getStubLastPasswordResetRecipients();
      assert.ok(Array.isArray(recipients));
      assert.equal(recipients.length, 2);
      assert.ok(recipients.includes(family.parentAEmail));
      assert.ok(recipients.includes(family.parentBEmail));
      assert.ok(!recipients.includes(family.childEmail));

      const rawToken = getStubLastPasswordResetToken();
      assert.ok(rawToken && rawToken.length >= 32);

      const active = await prisma.passwordResetToken.findMany({
        where: { userId: family.childUserId, usedAt: null }
      });
      assert.equal(active.length, 1);
      assert.equal(active[0].tokenHash, hashPasswordResetToken(rawToken));

      const staleGone = await prisma.passwordResetToken.findUnique({
        where: { id: stale.id }
      });
      assert.equal(staleGone, null);
    });

    it('parentB can also reset child password: 200 + mail to both parents', async () => {
      const family = await registerFamily({ stamp: `${Date.now()}-pb` });

      const res = await request(
        server,
        'POST',
        `/api/workspace/children/${family.childUserId}/reset-password`,
        { token: family.parentBToken }
      );
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.success, true);

      const recipients = getStubLastPasswordResetRecipients();
      assert.equal(recipients.length, 2);
      assert.ok(recipients.includes(family.parentAEmail));
      assert.ok(recipients.includes(family.parentBEmail));
    });

    it('childUserId from another workspace: 404, stub recipients unchanged', async () => {
      const familyA = await registerFamily({
        stamp: `${Date.now()}-isoA`,
        withParentB: false
      });
      const familyB = await registerFamily({
        stamp: `${Date.now()}-isoB`,
        withParentB: false
      });

      // Seed stub with a known successful send from familyA first.
      const seed = await request(
        server,
        'POST',
        `/api/workspace/children/${familyA.childUserId}/reset-password`,
        { token: familyA.parentAToken }
      );
      assert.equal(seed.status, 200, JSON.stringify(seed.json));
      const beforeRecipients = getStubLastPasswordResetRecipients();
      const beforeToken = getStubLastPasswordResetToken();
      assert.ok(beforeRecipients);
      assert.ok(beforeToken);

      const res = await request(
        server,
        'POST',
        `/api/workspace/children/${familyB.childUserId}/reset-password`,
        { token: familyA.parentAToken }
      );
      assert.equal(res.status, 404, JSON.stringify(res.json));
      assert.equal(res.json.error, 'child_not_found');

      assert.deepEqual(getStubLastPasswordResetRecipients(), beforeRecipients);
      assert.equal(getStubLastPasswordResetToken(), beforeToken);
    });

    it('observer cannot reset child password: 403', async () => {
      const family = await registerFamily({
        stamp: `${Date.now()}-obs`,
        withParentB: false
      });

      const passwordHash = await bcrypt.hash(PARENT_PASSWORD, 12);
      const observer = await prisma.user.create({
        data: {
          workspaceId: family.workspaceId,
          name: 'Observer',
          email: `cpr-obs-${Date.now()}@test.coparentes.app`,
          passwordHash,
          role: 'observer',
          twoFactorEnabled: false,
          highConflictMode: false
        }
      });
      const observerToken = await createSessionForUser(observer.id);

      const res = await request(
        server,
        'POST',
        `/api/workspace/children/${family.childUserId}/reset-password`,
        { token: observerToken }
      );
      assert.equal(res.status, 403, JSON.stringify(res.json));
      assert.equal(res.json.error, 'role_not_supported');
    });

    it('child cannot reset own password via this endpoint: 403', async () => {
      const family = await registerFamily({
        stamp: `${Date.now()}-ch`,
        withParentB: false
      });

      const res = await request(
        server,
        'POST',
        `/api/workspace/children/${family.childUserId}/reset-password`,
        { token: family.childToken }
      );
      assert.equal(res.status, 403, JSON.stringify(res.json));
      assert.equal(res.json.error, 'forbidden');
    });

    it('full cycle: reset → confirm → old child password fails, new works', async () => {
      const family = await registerFamily({
        stamp: `${Date.now()}-e2e`,
        withParentB: true
      });

      const reset = await request(
        server,
        'POST',
        `/api/workspace/children/${family.childUserId}/reset-password`,
        { token: family.parentAToken }
      );
      assert.equal(reset.status, 200, JSON.stringify(reset.json));

      const rawToken = getStubLastPasswordResetToken();
      assert.ok(rawToken);

      const confirm = await request(
        server,
        'POST',
        '/api/auth/reset-password/confirm',
        { body: { token: rawToken, newPassword: NEW_CHILD_PASSWORD } }
      );
      assert.equal(confirm.status, 200, JSON.stringify(confirm.json));

      const oldAccess = await request(server, 'POST', '/api/auth/child/access', {
        body: {
          childInviteCode: family.childInviteCode,
          dateOfBirth: family.dob,
          password: CHILD_PASSWORD
        }
      });
      assert.equal(oldAccess.status, 401, JSON.stringify(oldAccess.json));
      assert.equal(oldAccess.json.error, 'invalid_credentials');

      const newAccess = await request(server, 'POST', '/api/auth/child/access', {
        body: {
          childInviteCode: family.childInviteCode,
          dateOfBirth: family.dob,
          password: NEW_CHILD_PASSWORD
        }
      });
      assert.equal(newAccess.status, 200, JSON.stringify(newAccess.json));
      assert.ok(newAccess.json.token);
      assert.equal(newAccess.json.user.id, family.childUserId);
    });

    it('6th reset by same parent within window: 429', async () => {
      const family = await registerFamily({
        stamp: `${Date.now()}-rl`,
        withParentB: false
      });

      for (let i = 0; i < 5; i += 1) {
        const res = await request(
          server,
          'POST',
          `/api/workspace/children/${family.childUserId}/reset-password`,
          { token: family.parentAToken }
        );
        assert.equal(res.status, 200, `attempt ${i + 1}: ${JSON.stringify(res.json)}`);
      }

      const sixth = await request(
        server,
        'POST',
        `/api/workspace/children/${family.childUserId}/reset-password`,
        { token: family.parentAToken }
      );
      assert.equal(sixth.status, 429, JSON.stringify(sixth.json));
    });
  }
);
