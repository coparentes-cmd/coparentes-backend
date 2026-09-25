/**
 * E2E: register → join → thread → message → export → download
 * (Flutter AuthRepository + MessagingRepository + ExportRepository)
 *
 * Run:
 *   npm run db:migrate
 *   npm run test:e2e
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';

import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';

const PASSWORD = 'Coparentes!123';

function uniqueEmails() {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    parentA: `e2e-parent-a-${id}@test.coparentes.app`,
    parentB: `e2e-parent-b-${id}@test.coparentes.app`
  };
}

function assertAuthSession(body, expectedRole) {
  assert.ok(body.token, 'token required');
  assert.ok(body.user?.id, 'user.id required');
  assert.equal(body.user.role, expectedRole);
  assert.ok(body.workspace?.id, 'workspace.id required');
  assert.ok(body.workspace?.inviteCode, 'workspace.inviteCode required');
  assert.ok(Array.isArray(body.workspace.members));
}

function assertMessageThread(body) {
  assert.ok(body.id, 'thread.id required');
  assert.ok(body.subject);
  assert.ok(body.lastActivity);
  assert.ok(Array.isArray(body.messages));
}

/** Dummy client E2E envelope (backend does not validate crypto). */
function e2eBody(plainLabel, tone = 'neutral') {
  return {
    ciphertext: Buffer.from(plainLabel, 'utf8').toString('base64'),
    nonce: Buffer.from(`nonce-${plainLabel}`).toString('base64'),
    tone
  };
}

function parentThreadKeys(userIdA, userIdB) {
  const keys = [{ userId: userIdA, encryptedKey: `sealed-for-${userIdA}` }];
  if (userIdB) {
    keys.push({ userId: userIdB, encryptedKey: `sealed-for-${userIdB}` });
  }
  return keys;
}

function assertE2eMessage(message, plainLabel) {
  assert.equal(
    message.ciphertext,
    Buffer.from(plainLabel, 'utf8').toString('base64')
  );
  assert.equal(
    message.nonce,
    Buffer.from(`nonce-${plainLabel}`).toString('base64')
  );
  assert.equal(message.content, undefined);
}

function assertExportJob(body) {
  assert.ok(body.id);
  assert.ok(body.type);
  assert.ok(body.fromDate);
  assert.ok(body.toDate);
  assert.equal(body.status, 'completed');
}

describe('E2E flow (register → join → thread → message → export → download)', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string[]} */
  const testEmails = [];
  /** @type {string | null} */
  let testWorkspaceId = null;
  let e2eReady = false;

  before(async () => {
    if (process.env.RUN_E2E !== 'true') {
      return;
    }
    if (!(await dbReady())) {
      return;
    }
    e2eReady = true;
    server = await listen(createApp());
  });

  after(async () => {
    if (server) {
      server.close();
    }
    try {
      const { prisma } = await import('../src/lib/prisma.js');
      if (testWorkspaceId) {
        await prisma.workspace.delete({ where: { id: testWorkspaceId } });
      } else if (testEmails.length > 0) {
        await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
      }
    } catch {
      // cleanup best-effort
    }
  });

  it('full co-parenting API journey', async (t) => {
    if (!e2eReady) {
      t.skip('Set RUN_E2E=true (and DATABASE_URL + npm run db:migrate)');
      return;
    }

    const emails = uniqueEmails();
    testEmails.push(emails.parentA, emails.parentB);

    // 1. Register workspace (parentA) — Flutter: registerWorkspace
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'E2E Anna Test',
        email: emails.parentA,
        password: PASSWORD,
        workspaceName: 'Rodzina E2E',
        consents: {
          TERMS: true,
          DATA_PROCESSING: true,
          CHILD_DATA: true,
          EMAIL_NOTIFICATIONS: true,
          MARKETING: false,
          ANALYTICS: false
        }
      }
    });
    assert.equal(register.status, 201, `register failed: ${JSON.stringify(register.json)}`);
    assertAuthSession(register.json, 'parentA');
    const inviteCode = register.json.workspace.inviteCode;
    const childInviteCode = register.json.workspace.childInviteCode;
    assert.ok(childInviteCode, 'workspace.childInviteCode required');
    testWorkspaceId = register.json.workspace.id;
    const tokenA = register.json.token;
    const userIdA = register.json.user.id;

    // 1b. Add child (parentA onboarding) — Flutter: POST /workspace/children
    const addChild = await request(server, 'POST', '/api/workspace/children', {
      token: tokenA,
      body: {
        name: 'E2E Zosia Test',
        dateOfBirth: '2016-05-12T00:00:00.000Z',
        school: 'SP E2E'
      }
    });
    assert.equal(
      addChild.status,
      201,
      `addChild failed: ${JSON.stringify(addChild.json)}`
    );
    assert.ok(addChild.json.id);
    assert.equal(addChild.json.name, 'E2E Zosia Test');
    assert.equal(addChild.json.school, 'SP E2E');

    const addChild2 = await request(server, 'POST', '/api/workspace/children', {
      token: tokenA,
      body: {
        name: 'E2E Tomek Test',
        dateOfBirth: '2013-09-07T00:00:00.000Z',
        school: 'SP E2E'
      }
    });
    assert.equal(addChild2.status, 201);
    assert.equal(addChild2.json.name, 'E2E Tomek Test');

    const forbiddenChild = await request(server, 'POST', '/api/workspace/children', {
      token: tokenA,
      body: { name: 'Future Kid', dateOfBirth: '2030-01-01T00:00:00.000Z' }
    });
    assert.equal(forbiddenChild.status, 400);
    assert.equal(forbiddenChild.json.error, 'invalid_date_of_birth');

    // 2. Join workspace (parentB) — Flutter: joinWorkspace
    const join = await request(server, 'POST', '/api/auth/join', {
      body: {
        name: 'E2E Marek Test',
        email: emails.parentB,
        password: PASSWORD,
        inviteCode,
        role: 'parentB'
      }
    });
    assert.equal(join.status, 201, `join failed: ${JSON.stringify(join.json)}`);
    assertAuthSession(join.json, 'parentB');
    assert.equal(join.json.workspace.id, register.json.workspace.id);
    assert.ok(
      join.json.workspace.members.length >= 2,
      'workspace should list both parents'
    );
    const tokenB = join.json.token;
    const userIdB = join.json.user.id;

    const parentBCannotAddChild = await request(server, 'POST', '/api/workspace/children', {
      token: tokenB,
      body: {
        name: 'Blocked',
        dateOfBirth: '2016-05-12T00:00:00.000Z'
      }
    });
    assert.equal(parentBCannotAddChild.status, 403);
    assert.equal(parentBCannotAddChild.json.error, 'forbidden');

    // 3. Create thread (parentA) — Flutter: createThread
    const createThread = await request(server, 'POST', '/api/threads', {
      token: tokenA,
      body: {
        subject: 'E2E test wątek',
        category: 'Ogólne',
        childId: null,
        threadKeys: parentThreadKeys(userIdA, userIdB)
      }
    });
    assert.equal(
      createThread.status,
      201,
      `createThread failed: ${JSON.stringify(createThread.json)}`
    );
    assertMessageThread(createThread.json);
    assert.equal(createThread.json.messages.length, 0);
    const threadId = createThread.json.id;

    const myKeyA = await request(server, 'GET', `/api/threads/${threadId}/keys/mine`, {
      token: tokenA
    });
    assert.equal(myKeyA.status, 200);
    assert.equal(myKeyA.json.encryptedKey, `sealed-for-${userIdA}`);

    const myKeyB = await request(server, 'GET', `/api/threads/${threadId}/keys/mine`, {
      token: tokenB
    });
    assert.equal(myKeyB.status, 200);
    assert.equal(myKeyB.json.encryptedKey, `sealed-for-${userIdB}`);

    // 4. Send message (parentB) — Flutter: sendMessage (E2E ciphertext)
    const labelB = 'Wiadomość E2E od parentB';
    const sendMessage = await request(server, 'POST', `/api/threads/${threadId}/messages`, {
      token: tokenB,
      body: e2eBody(labelB)
    });
    assert.equal(
      sendMessage.status,
      201,
      `sendMessage failed: ${JSON.stringify(sendMessage.json)}`
    );
    assertMessageThread(sendMessage.json);
    assert.ok(sendMessage.json.messages.length >= 1);
    const lastMessage = sendMessage.json.messages.at(-1);
    assertE2eMessage(lastMessage, labelB);
    assert.equal(lastMessage.tone, 'neutral');
    assert.equal(lastMessage.isRead, false, 'just-sent message must not be read yet');
    assert.ok(lastMessage.hash);

    // 4b. Parent A sends — Parent B must see the message
    const labelA = 'Wiadomość E2E od parentA';
    const sendFromA = await request(server, 'POST', `/api/threads/${threadId}/messages`, {
      token: tokenA,
      body: e2eBody(labelA)
    });
    assert.equal(sendFromA.status, 201);
    assertE2eMessage(sendFromA.json.messages.at(-1), labelA);
    assert.equal(
      sendFromA.json.messages.at(-1).isRead,
      false,
      'parentA just-sent message must start unread'
    );

    const markBySender = await request(server, 'POST', `/api/threads/${threadId}/read`, {
      token: tokenA
    });
    assert.equal(markBySender.status, 200);
    const ownAfterSelfRead = markBySender.json.messages.find(
      (m) => m.ciphertext === Buffer.from(labelA, 'utf8').toString('base64')
    );
    assert.ok(ownAfterSelfRead);
    assert.equal(
      ownAfterSelfRead.isRead,
      false,
      'sender marking thread as read must not mark own outgoing messages'
    );

    const listAsB = await request(server, 'GET', '/api/threads', {
      token: tokenB
    });
    assert.equal(listAsB.status, 200);
    const threadForB = listAsB.json.threads.find((t) => t.id === threadId);
    assert.ok(threadForB, 'parentB should see thread created by parentA');
    assert.ok(
      threadForB.messages.some(
        (m) => m.ciphertext === Buffer.from(labelA, 'utf8').toString('base64')
      ),
      'parentB should see message sent by parentA'
    );
    assert.equal(
      threadForB.hasUnread,
      true,
      'parentB should have unread incoming message from parentA'
    );

    const listAsA = await request(server, 'GET', '/api/threads', {
      token: tokenA
    });
    const threadForA = listAsA.json.threads.find((t) => t.id === threadId);
    // UWAGA: ten test failuje od sierpnia 2026 (commit 3872cc8) - asercja zakłada że
    // hasUnread pozostaje true dla A po tym jak A oznaczył wątek jako przeczytany,
    // ale markThreadAsRead operuje na globalnym Message.isRead (nie per-viewer),
    // więc po odczycie przez A, wiadomość B faktycznie staje się isRead:true dla wszystkich.
    // To NIE jest regresja z proxy-addr/dependency bump (zweryfikowane 2026-09-24) - to
    // przedistniejąca niespójność testu z modelem danych. Do naprawienia osobno:
    // albo popraw asercję (oczekuj false), albo zaprojektuj per-viewer read status.
    assert.equal(
      threadForA.hasUnread,
      true,
      'parentA should still have unread message from parentB (own message is excluded from unread count)'
    );

    const markRead = await request(server, 'POST', `/api/threads/${threadId}/read`, {
      token: tokenB
    });
    assert.equal(markRead.status, 200);
    assert.equal(markRead.json.hasUnread, false);

    const listAfterRead = await request(server, 'GET', '/api/threads', {
      token: tokenB
    });
    const threadAfterRead = listAfterRead.json.threads.find((t) => t.id === threadId);
    assert.equal(threadAfterRead.hasUnread, false);

    const schoolChannel = await request(server, 'POST', '/api/threads/channel', {
      token: tokenA,
      body: {
        category: 'Szkoła',
        threadKeys: parentThreadKeys(userIdA, userIdB)
      }
    });
    assert.equal(schoolChannel.status, 200);
    assert.equal(schoolChannel.json.subject, 'Szkoła');
    assert.equal(schoolChannel.json.category, 'Szkoła');

    const schoolAgain = await request(server, 'POST', '/api/threads/channel', {
      token: tokenB,
      body: {
        category: 'Szkoła',
        threadKeys: parentThreadKeys(userIdA, userIdB)
      }
    });
    assert.equal(schoolAgain.status, 200);
    assert.equal(schoolAgain.json.id, schoolChannel.json.id);

    const allChannel = await request(server, 'POST', '/api/threads/channel', {
      token: tokenA,
      body: {
        category: 'Wszystkie',
        threadKeys: parentThreadKeys(userIdA, userIdB)
      }
    });
    assert.equal(allChannel.status, 200);
    assert.equal(allChannel.json.subject, 'Wszystkie');
    assert.equal(allChannel.json.category, 'Wszystkie');

    const sendToAll = await request(
      server,
      'POST',
      `/api/threads/${allChannel.json.id}/messages`,
      {
        token: tokenA,
        body: e2eBody('Wiadomość w kanale Wszystkie')
      }
    );
    assert.equal(
      sendToAll.status,
      201,
      `sendToAll failed: ${JSON.stringify(sendToAll.json)}`
    );
    assertE2eMessage(sendToAll.json.messages.at(-1), 'Wiadomość w kanale Wszystkie');

    // 5. List threads (parentA) — Flutter: getThreads
    const listThreads = await request(server, 'GET', '/api/threads', {
      token: tokenA
    });
    assert.equal(listThreads.status, 200);
    assert.ok(Array.isArray(listThreads.json.threads));
    assert.ok(
      listThreads.json.threads.some((t) => t.id === threadId),
      'created thread visible in list'
    );

    const financeChannel = await request(server, 'POST', '/api/threads/channel', {
      token: tokenA,
      body: {
        category: 'Finanse',
        threadKeys: parentThreadKeys(userIdA, userIdB)
      }
    });
    assert.equal(financeChannel.status, 200);
    assert.equal(financeChannel.json.audience, 'parents');

    const familyChannel = await request(server, 'POST', '/api/threads/channel', {
      token: tokenA,
      body: {
        category: 'Rodzina',
        threadKeys: parentThreadKeys(userIdA, userIdB)
      }
    });
    assert.equal(
      familyChannel.status,
      200,
      `familyChannel failed: ${JSON.stringify(familyChannel.json)}`
    );
    assert.equal(familyChannel.json.audience, 'family');
    assert.equal(familyChannel.json.category, 'Rodzina');

    const joinPreview = await request(
      server,
      'GET',
      `/api/auth/join-preview?childInviteCode=${encodeURIComponent(childInviteCode)}`
    );
    assert.equal(joinPreview.status, 200);
    assert.ok(joinPreview.json.children.length >= 2);

    const joinChild = await request(server, 'POST', '/api/auth/child/access', {
      body: {
        name: 'E2E Zosia Child',
        password: PASSWORD,
        childInviteCode,
        dateOfBirth: '2016-05-12T00:00:00.000Z'
      }
    });
    assert.equal(joinChild.status, 201, `joinChild failed: ${JSON.stringify(joinChild.json)}`);
    assertAuthSession(joinChild.json, 'child');
    const tokenChild = joinChild.json.token;
    const userIdChild = joinChild.json.user.id;

    const loginChild = await request(server, 'POST', '/api/auth/child/access', {
      body: {
        password: PASSWORD,
        childInviteCode,
        dateOfBirth: '2016-05-12T00:00:00.000Z'
      }
    });
    assert.equal(loginChild.status, 200, `loginChild failed: ${JSON.stringify(loginChild.json)}`);
    assertAuthSession(loginChild.json, 'child');

    const listAsChild = await request(server, 'GET', '/api/threads', {
      token: tokenChild
    });
    assert.equal(listAsChild.status, 200);
    assert.ok(
      listAsChild.json.threads.every((t) => t.audience === 'family'),
      'child should only see family threads'
    );
    assert.ok(
      listAsChild.json.threads.some((t) => t.category === 'Rodzina'),
      'child should see Rodzina channel'
    );
    assert.ok(
      !listAsChild.json.threads.some((t) => t.id === threadId),
      'child must not see parent custom thread'
    );
    assert.ok(
      !listAsChild.json.threads.some((t) => t.id === financeChannel.json.id),
      'child must not see Finanse channel'
    );

    const forbiddenThread = await request(server, 'GET', `/api/threads/${threadId}`, {
      token: tokenChild
    });
    assert.equal(forbiddenThread.status, 404);

    const familyThread = listAsChild.json.threads.find((t) => t.category === 'Rodzina');
    assert.ok(familyThread, 'family thread required');

    const familySync = await request(
      server,
      'POST',
      `/api/threads/${familyThread.id}/keys/family-sync`,
      {
        token: tokenA,
        body: {
          userId: userIdChild,
          encryptedKey: `sealed-for-${userIdChild}`
        }
      }
    );
    assert.equal(
      familySync.status,
      201,
      `family-sync failed: ${JSON.stringify(familySync.json)}`
    );

    const childKey = await request(
      server,
      'GET',
      `/api/threads/${familyThread.id}/keys/mine`,
      { token: tokenChild }
    );
    assert.equal(childKey.status, 200);
    assert.equal(childKey.json.encryptedKey, `sealed-for-${userIdChild}`);

    const childMessage = await request(
      server,
      'POST',
      `/api/threads/${familyThread.id}/messages`,
      {
        token: tokenChild,
        body: e2eBody('Cześć rodzice!')
      }
    );
    assert.equal(childMessage.status, 201);
    assertE2eMessage(childMessage.json.messages.at(-1), 'Cześć rodzice!');

    const calendarAsChild = await request(server, 'GET', '/api/calendar', {
      token: tokenChild
    });
    assert.equal(calendarAsChild.status, 200);

    // 6. Create export — Flutter: createExport
    const now = new Date().toISOString();
    const createExport = await request(server, 'POST', '/api/exports', {
      token: tokenA,
      body: {
        type: 'messages',
        fromDate: '2025-01-01T00:00:00.000Z',
        toDate: now,
        threadId
      }
    });
    assert.equal(
      createExport.status,
      201,
      `createExport failed: ${JSON.stringify(createExport.json)}`
    );
    assertExportJob(createExport.json);
    const exportId = createExport.json.id;

    // 7. Download export — Flutter: downloadExport
    const download = await request(server, 'GET', `/api/exports/${exportId}/download`, {
      token: tokenA
    });
    assert.equal(
      download.status,
      200,
      `download failed: ${JSON.stringify(download.json)}`
    );
    assertExportJob(download.json);
    assert.ok(download.json.payload, 'payload required');
    assert.ok(
      Array.isArray(download.json.payload.items) ||
        download.json.payload.items === undefined,
      'payload should include export items structure'
    );
    assert.equal(download.json.payload.type, 'messages');
    assert.ok(download.json.payload.items.length >= 1);

    // 7b. Full-pack export includes calendar + finance sections when present
    const fullPack = await request(server, 'POST', '/api/exports', {
      token: tokenA,
      body: {
        type: 'fullPack',
        fromDate: '2025-01-01T00:00:00.000Z',
        toDate: now
      }
    });
    assert.equal(fullPack.status, 201);
    const fullPackDownload = await request(
      server,
      'GET',
      `/api/exports/${fullPack.json.id}/download`,
      { token: tokenA }
    );
    assert.equal(fullPackDownload.status, 200);
    assert.equal(fullPackDownload.json.payload.type, 'fullPack');
    assert.ok(Array.isArray(fullPackDownload.json.payload.items));
    assert.ok(
      fullPackDownload.json.payload.items.some(
        (item) => item.recordType === 'messageThread'
      ),
      'fullPack should include message threads'
    );

    const calendarExport = await request(server, 'POST', '/api/exports', {
      token: tokenA,
      body: {
        type: 'calendar',
        fromDate: '2025-01-01T00:00:00.000Z',
        toDate: now
      }
    });
    assert.equal(calendarExport.status, 201);
    const calendarDownload = await request(
      server,
      'GET',
      `/api/exports/${calendarExport.json.id}/download`,
      { token: tokenA }
    );
    assert.equal(calendarDownload.status, 200);
    assert.equal(calendarDownload.json.payload.type, 'calendar');
    assert.ok(Array.isArray(calendarDownload.json.payload.items));

    // 8. Logout (parentB) — Flutter: logout
    const logout = await request(server, 'POST', '/api/auth/logout', {
      token: tokenB
    });
    assert.equal(logout.status, 204);
    assert.equal(logout.raw, '');

    // Session invalidated after logout
    const afterLogout = await request(server, 'GET', '/api/threads', {
      token: tokenB
    });
    assert.equal(afterLogout.status, 401);
  });
});
