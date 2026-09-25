/**
 * Soft-delete account: anonymize, free parentB slot, keep message history.
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

const PASSWORD = 'Coparentes!123';
const WRONG_PASSWORD = 'WrongPassword999!';

function uniqueEmails() {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    parentA: `del-parent-a-${id}@test.coparentes.app`,
    parentB: `del-parent-b-${id}@test.coparentes.app`,
    parentB2: `del-parent-b2-${id}@test.coparentes.app`
  };
}

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: true,
  MARKETING: false,
  ANALYTICS: false
};

function e2eBody(plainLabel) {
  return {
    ciphertext: Buffer.from(plainLabel, 'utf8').toString('base64'),
    nonce: Buffer.from(`nonce-${plainLabel}`).toString('base64'),
    tone: 'neutral'
  };
}

function parentThreadKeys(userIdA, userIdB) {
  return [
    { userId: userIdA, encryptedKey: `sealed-for-${userIdA}` },
    { userId: userIdB, encryptedKey: `sealed-for-${userIdB}` }
  ];
}

describe('Account soft-delete', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string[]} */
  const testEmails = [];
  /** @type {string | null} */
  let testWorkspaceId = null;

  before(async () => {
    server = await listen(createApp());
  });

  after(async () => {
    server?.close();
    if (testWorkspaceId) {
      await prisma.messageUserTag.deleteMany({
        where: { workspaceId: testWorkspaceId }
      }).catch(() => {});
      await prisma.message.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.threadKey.deleteMany({
        where: { thread: { workspaceId: testWorkspaceId } }
      });
      await prisma.thread.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.session.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.loginOtpChallenge.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.trustedDevice.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.userConsent.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.emailInvite.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.user.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.workspace.delete({ where: { id: testWorkspaceId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('wrong password does not change account; delete frees slot and keeps message snapshots', async () => {
    const emails = uniqueEmails();
    testEmails.push(emails.parentA, emails.parentB, emails.parentB2);

    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Delete Anna',
        email: emails.parentA,
        password: PASSWORD,
        workspaceName: 'Rodzina Delete',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    const inviteCode = register.json.workspace.inviteCode;
    testWorkspaceId = register.json.workspace.id;
    const tokenA = register.json.token;
    const userIdA = register.json.user.id;

    const join = await request(server, 'POST', '/api/auth/join', {
      body: {
        name: 'Delete Marek',
        email: emails.parentB,
        password: PASSWORD,
        inviteCode,
        role: 'parentB'
      }
    });
    assert.equal(join.status, 201, JSON.stringify(join.json));
    const tokenB = join.json.token;
    const userIdB = join.json.user.id;

    const thread = await request(server, 'POST', '/api/threads', {
      token: tokenA,
      body: {
        subject: 'Szkoła',
        category: 'Szkoła',
        audience: 'parents',
        threadKeys: parentThreadKeys(userIdA, userIdB)
      }
    });
    assert.equal(thread.status, 201, JSON.stringify(thread.json));
    const threadId = thread.json.id;

    const labelFromB = 'Wiadomość od Marka przed usunięciem';
    const sendB = await request(
      server,
      'POST',
      `/api/threads/${threadId}/messages`,
      { token: tokenB, body: e2eBody(labelFromB) }
    );
    assert.equal(sendB.status, 201, JSON.stringify(sendB.json));

    const msgFromB = sendB.json.messages.find((m) => m.senderId === userIdB);
    assert.ok(msgFromB);
    const snapshotSenderName = msgFromB.senderName;
    assert.ok(snapshotSenderName);
    assert.match(snapshotSenderName, /Marek|Delete/i);

    // 7. Wrong password — no change
    const badDelete = await request(server, 'POST', '/api/account/delete', {
      token: tokenB,
      body: { password: WRONG_PASSWORD }
    });
    assert.equal(badDelete.status, 401);
    assert.equal(badDelete.json.error, 'invalid_password');

    const stillAlive = await prisma.user.findUnique({ where: { id: userIdB } });
    assert.equal(stillAlive.email, emails.parentB);
    assert.equal(stillAlive.deletedAt, null);

    // 2. Correct delete
    const del = await request(server, 'POST', '/api/account/delete', {
      token: tokenB,
      body: { password: PASSWORD }
    });
    assert.equal(del.status, 200, JSON.stringify(del.json));
    assert.equal(del.json.success, true);

    const threadKeyForB = await prisma.threadKey.findUnique({
      where: { threadId_userId: { threadId, userId: userIdB } }
    });
    assert.equal(threadKeyForB, null, 'ThreadKey for deleted user B should be removed');

    // 3. Old session of B is dead
    const sessionAfter = await request(server, 'GET', '/api/auth/session', {
      token: tokenB
    });
    assert.equal(sessionAfter.status, 401);
    assert.equal(sessionAfter.json.error, 'invalid_session');

    // 6. Email placeholder
    const anonymized = await prisma.user.findUnique({ where: { id: userIdB } });
    assert.equal(anonymized.email, `deleted-${userIdB}@coparentes.internal`);
    assert.ok(anonymized.deletedAt);
    assert.equal(anonymized.publicKey, null);
    assert.equal(anonymized.privateKeyEnvelope, null);

    // 4. Parent A still sees B's message with snapshot senderName
    const threadsA = await request(server, 'GET', '/api/threads', {
      token: tokenA
    });
    assert.equal(threadsA.status, 200);
    assert.ok(Array.isArray(threadsA.json.threads));
    const threadRow = threadsA.json.threads.find((row) => row.id === threadId);
    assert.ok(threadRow, 'parentA should still see the thread');
    const historical = threadRow.messages.find((m) => m.senderId === userIdB);
    assert.ok(historical, 'parentA should still see parentB messages');
    assert.equal(historical.senderName, snapshotSenderName);

    // Soft-deleted B must not appear in members
    const sessionA = await request(server, 'GET', '/api/auth/session', {
      token: tokenA
    });
    assert.equal(sessionA.status, 200);
    const memberIds = sessionA.json.workspace.members.map((m) => m.id);
    assert.equal(memberIds.includes(userIdB), false);
    assert.equal(memberIds.includes(userIdA), true);

    // 5. New parentB can join (slot freed)
    const freshInvite = sessionA.json.workspace.inviteCode;
    const join2 = await request(server, 'POST', '/api/auth/join', {
      body: {
        name: 'Delete Nowy',
        email: emails.parentB2,
        password: PASSWORD,
        inviteCode: freshInvite,
        role: 'parentB'
      }
    });
    assert.equal(join2.status, 201, JSON.stringify(join2.json));
    assert.equal(join2.json.user.role, 'parentB');
    assert.notEqual(join2.json.user.id, userIdB);
  });
});
