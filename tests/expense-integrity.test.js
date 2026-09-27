/**
 * Expense integrity: forced paidBy/pending on create, status FSM, amount cap,
 * encrypted dispute notes.
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
import { isEncrypted } from '../src/services/crypto.service.js';

const PASSWORD = 'ExpenseIntegrity99!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

function expenseBody(overrides = {}) {
  return {
    title: 'Test wydatek',
    amount: 100,
    category: 'Szkoła',
    childIds: [],
    splitRatio: 0.5,
    date: new Date().toISOString(),
    ...overrides
  };
}

describe('Expense integrity (paidBy/status/FSM/amount/note)', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string | null} */
  let testWorkspaceId = null;

  before(async () => {
    server = await listen(createApp());
  });

  after(async () => {
    server?.close();
    if (testWorkspaceId) {
      await prisma.expenseChild.deleteMany({
        where: { expense: { workspaceId: testWorkspaceId } }
      });
      await prisma.expense.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.session.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.userConsent.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.emailInvite.deleteMany({
        where: { workspaceId: testWorkspaceId }
      });
      await prisma.user.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.workspace.delete({ where: { id: testWorkspaceId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('enforces create paidBy/pending, FSM transitions, amount max, encrypted note', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const emailA = `exp-int-a-${id}@test.coparentes.app`;
    const emailB = `exp-int-b-${id}@test.coparentes.app`;

    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Integrity Anna',
        email: emailA,
        password: PASSWORD,
        workspaceName: 'Rodzina Expense Integrity',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    testWorkspaceId = register.json.workspace.id;
    const tokenA = register.json.token;
    const userAId = register.json.user.id;
    const inviteCode = register.json.workspace.inviteCode;

    const join = await request(server, 'POST', '/api/auth/join', {
      body: {
        name: 'Integrity Marek',
        email: emailB,
        password: PASSWORD,
        inviteCode,
        role: 'parentB'
      }
    });
    assert.equal(join.status, 201, JSON.stringify(join.json));
    const tokenB = join.json.token;
    const userBId = join.json.user.id;

    // --- POST ignores client paidBy + status ---
    const spoofed = await request(server, 'POST', '/api/finances/expenses', {
      token: tokenA,
      body: expenseBody({
        title: 'Spoof attempt',
        paidBy: userBId,
        status: 'accepted'
      })
    });
    assert.equal(spoofed.status, 201, JSON.stringify(spoofed.json));
    assert.equal(spoofed.json.paidBy, userAId, 'paidBy must be requester, not body');
    assert.equal(spoofed.json.status, 'pending', 'status must always be pending');

    const expenseId = spoofed.json.id;

    // --- Payer cannot accept own expense ---
    const selfAccept = await request(
      server,
      'POST',
      `/api/finances/expenses/${expenseId}/status`,
      { token: tokenA, body: { status: 'accepted' } }
    );
    assert.equal(selfAccept.status, 403);
    assert.equal(selfAccept.json.error, 'forbidden_status_transition');

    // --- Payer cannot dispute own expense ---
    const selfDispute = await request(
      server,
      'POST',
      `/api/finances/expenses/${expenseId}/status`,
      { token: tokenA, body: { status: 'disputed' } }
    );
    assert.equal(selfDispute.status, 403);
    assert.equal(selfDispute.json.error, 'forbidden_status_transition');

    // --- Other parent can accept ---
    const otherAccept = await request(
      server,
      'POST',
      `/api/finances/expenses/${expenseId}/status`,
      { token: tokenB, body: { status: 'accepted' } }
    );
    assert.equal(otherAccept.status, 200, JSON.stringify(otherAccept.json));
    assert.equal(otherAccept.json.status, 'accepted');

    // --- Other parent cannot settle (only payer) ---
    const otherSettle = await request(
      server,
      'POST',
      `/api/finances/expenses/${expenseId}/status`,
      { token: tokenB, body: { status: 'settled' } }
    );
    assert.equal(otherSettle.status, 403);
    assert.equal(otherSettle.json.error, 'forbidden_status_transition');

    // --- Payer can settle accepted expense ---
    const payerSettle = await request(
      server,
      'POST',
      `/api/finances/expenses/${expenseId}/status`,
      { token: tokenA, body: { status: 'settled' } }
    );
    assert.equal(payerSettle.status, 200, JSON.stringify(payerSettle.json));
    assert.equal(payerSettle.json.status, 'settled');

    // --- settled is terminal ---
    const fromSettled = await request(
      server,
      'POST',
      `/api/finances/expenses/${expenseId}/status`,
      { token: tokenA, body: { status: 'pending' } }
    );
    assert.equal(fromSettled.status, 403);
    assert.equal(fromSettled.json.error, 'forbidden_status_transition');

    // --- disputed is terminal ---
    const forDispute = await request(server, 'POST', '/api/finances/expenses', {
      token: tokenA,
      body: expenseBody({ title: 'Do sporu' })
    });
    assert.equal(forDispute.status, 201, JSON.stringify(forDispute.json));
    const disputeId = forDispute.json.id;
    const disputeNotePlain = 'Nie zgadzam się z tą kwotą testową';

    const disputed = await request(
      server,
      'POST',
      `/api/finances/expenses/${disputeId}/status`,
      {
        token: tokenB,
        body: { status: 'disputed', note: disputeNotePlain }
      }
    );
    assert.equal(disputed.status, 200, JSON.stringify(disputed.json));
    assert.equal(disputed.json.status, 'disputed');
    assert.equal(disputed.json.note, disputeNotePlain);

    const rawRow = await prisma.expense.findUnique({
      where: { id: disputeId },
      select: { note: true }
    });
    assert.ok(rawRow?.note);
    assert.notEqual(rawRow.note, disputeNotePlain, 'DB must not store plaintext note');
    assert.equal(isEncrypted(rawRow.note), true, 'note must use enc:v1: prefix');

    const fromDisputed = await request(
      server,
      'POST',
      `/api/finances/expenses/${disputeId}/status`,
      { token: tokenB, body: { status: 'accepted' } }
    );
    assert.equal(fromDisputed.status, 403);
    assert.equal(fromDisputed.json.error, 'forbidden_status_transition');

    // --- amount over max ---
    const tooBig = await request(server, 'POST', '/api/finances/expenses', {
      token: tokenA,
      body: expenseBody({ title: 'Za dużo', amount: 1_000_001 })
    });
    assert.equal(tooBig.status, 400);
    assert.equal(tooBig.json.error, 'invalid_request');
  });
});
