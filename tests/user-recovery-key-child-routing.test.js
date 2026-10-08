/**
 * Child recovery-key e-mail routing: parents receive the code, not the
 * synthetic child@accounts.coparentes.internal address.
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
import { createRecoveryCode } from '../src/utils/security.js';
import {
  getStubLastRecoveryCode,
  getStubLastRecoveryRecipients
} from '../src/utils/mailer.js';
import { resetUserRateLimitersForTests } from '../src/routes/user.js';
import { createSessionForUser } from '../src/services/session.js';
import { createWorkspace } from '../src/services/workspace.js';

const PASSWORD = 'ChildRecov1!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

function fakeEnvelope(tag) {
  return JSON.stringify({
    v: 1,
    tag,
    kdf: {
      algo: 'argon2id',
      salt: 'dGVzdA==',
      memory: 64,
      iterations: 1,
      parallelism: 1
    },
    cipher: {
      algo: 'aes256gcm',
      nonce: 'dGVzdA==',
      ciphertext: 'dGVzdA=='
    }
  });
}

describe(
  'POST /api/user/recovery-key child → parents routing',
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

    beforeEach(async () => {
      await resetUserRateLimitersForTests();
    });

    it('child account: e-mail goes to both parents, not synthetic child address', async () => {
      const stamp = Date.now();
      const parentAEmail = `rec-pa-${stamp}@test.coparentes.app`;
      const parentBEmail = `rec-pb-${stamp}@test.coparentes.app`;

      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Parent A',
          email: parentAEmail,
          password: PASSWORD,
          workspaceName: 'Rec Family Both',
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      const workspaceId = register.json.workspace.id;
      workspaceIds.push(workspaceId);
      const parentAToken = register.json.token;
      const childInviteCode = register.json.workspace.childInviteCode;

      const joinB = await request(server, 'POST', '/api/auth/join', {
        body: {
          inviteCode: register.json.workspace.inviteCode,
          name: 'Parent B',
          email: parentBEmail,
          password: PASSWORD
        }
      });
      assert.equal(joinB.status, 201, JSON.stringify(joinB.json));

      const dob = new Date(Date.UTC(2014, 5, 15)).toISOString();
      const addChild = await request(server, 'POST', '/api/workspace/children', {
        token: parentAToken,
        body: { name: 'Zosia Testowa', dateOfBirth: dob, school: null }
      });
      assert.equal(addChild.status, 201, JSON.stringify(addChild.json));

      const childAccess = await request(server, 'POST', '/api/auth/child/access', {
        body: {
          childInviteCode,
          dateOfBirth: dob,
          password: PASSWORD,
          name: 'Zosia'
        }
      });
      assert.equal(childAccess.status, 201, JSON.stringify(childAccess.json));
      const childToken = childAccess.json.token;
      const childEmail = childAccess.json.user.email;
      assert.match(childEmail, /@accounts\.coparentes\.internal$/);

      const code = createRecoveryCode();
      const res = await request(server, 'POST', '/api/user/recovery-key', {
        token: childToken,
        body: {
          recoveryKeyEnvelope: fakeEnvelope('child-rec'),
          recoveryCode: code
        }
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(getStubLastRecoveryCode(), code);

      const recipients = getStubLastRecoveryRecipients();
      assert.ok(Array.isArray(recipients), 'stub recipients must be an array');
      assert.equal(recipients.length, 2);
      assert.ok(recipients.includes(parentAEmail));
      assert.ok(recipients.includes(parentBEmail));
      assert.ok(!recipients.includes(childEmail));
    });

    it('parent account: e-mail still goes to self only', async () => {
      const stamp = Date.now();
      const email = `rec-parent-only-${stamp}@test.coparentes.app`;
      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Solo Parent',
          email,
          password: PASSWORD,
          workspaceName: 'Rec Solo Parent',
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      workspaceIds.push(register.json.workspace.id);

      const code = createRecoveryCode();
      const res = await request(server, 'POST', '/api/user/recovery-key', {
        token: register.json.token,
        body: {
          recoveryKeyEnvelope: fakeEnvelope('parent-rec'),
          recoveryCode: code
        }
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(getStubLastRecoveryCode(), code);
      const recipients = getStubLastRecoveryRecipients();
      assert.deepEqual(recipients, [email]);
    });

    it('child with only one parent: e-mail goes to that parent', async () => {
      const stamp = Date.now();
      const parentEmail = `rec-one-p-${stamp}@test.coparentes.app`;
      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Only Parent',
          email: parentEmail,
          password: PASSWORD,
          workspaceName: 'Rec One Parent',
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      workspaceIds.push(register.json.workspace.id);
      const childInviteCode = register.json.workspace.childInviteCode;

      const dob = new Date(Date.UTC(2015, 2, 1)).toISOString();
      const addChild = await request(server, 'POST', '/api/workspace/children', {
        token: register.json.token,
        body: { name: 'Tomek', dateOfBirth: dob }
      });
      assert.equal(addChild.status, 201, JSON.stringify(addChild.json));

      const childAccess = await request(server, 'POST', '/api/auth/child/access', {
        body: {
          childInviteCode,
          dateOfBirth: dob,
          password: PASSWORD,
          name: 'Tomek'
        }
      });
      assert.equal(childAccess.status, 201, JSON.stringify(childAccess.json));

      const code = createRecoveryCode();
      const res = await request(server, 'POST', '/api/user/recovery-key', {
        token: childAccess.json.token,
        body: {
          recoveryKeyEnvelope: fakeEnvelope('one-parent-rec'),
          recoveryCode: code
        }
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.deepEqual(getStubLastRecoveryRecipients(), [parentEmail]);
    });

    it('child with no parents in workspace: 400 no_recovery_contact', async () => {
      const stamp = Date.now();
      const workspace = await createWorkspace({
        name: `Orphan WS ${stamp}`
      });
      workspaceIds.push(workspace.id);

      const childProfile = await prisma.child.create({
        data: {
          workspaceId: workspace.id,
          name: 'Orphan Child',
          dateOfBirth: new Date(Date.UTC(2016, 0, 1)),
          inviteCode: `ORPHAN${stamp}`
        }
      });

      const passwordHash = await bcrypt.hash(PASSWORD, 12);
      const childUser = await prisma.user.create({
        data: {
          workspaceId: workspace.id,
          name: 'Orphan',
          email: `child+${childProfile.id}@accounts.coparentes.internal`,
          passwordHash,
          role: 'child',
          childProfileId: childProfile.id,
          twoFactorEnabled: false,
          highConflictMode: false
        }
      });

      const token = await createSessionForUser(childUser.id);

      const res = await request(server, 'POST', '/api/user/recovery-key', {
        token,
        body: {
          recoveryKeyEnvelope: fakeEnvelope('no-parent'),
          recoveryCode: createRecoveryCode()
        }
      });
      assert.equal(res.status, 400, JSON.stringify(res.json));
      assert.equal(res.json.error, 'no_recovery_contact');
    });
  }
);
