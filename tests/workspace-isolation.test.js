/**
 * Cross-family (workspace) data isolation integration tests.
 * Requires PostgreSQL — skipped when DB is unavailable.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.OTP_ENABLED = 'false';
process.env.SEED_DEMO_DATA = 'false';

const { createApp } = await import('../src/createApp.js');
const { listen, request, dbReady } = await import('./helpers/http.js');
const { prisma } = await import('../src/lib/prisma.js');
const { createWorkspace } = await import('../src/services/workspace.js');
const { createSessionForUser } = await import('../src/services/session.js');
const { createExpense } = await import('../src/services/finances.js');

const dbAvailable = await dbReady();

describe('Workspace isolation', { skip: !dbAvailable }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let tokenA;
  /** @type {string} */
  let expenseBId;
  /** @type {string} */
  let workspaceBId;

  before(async () => {
    server = await listen(createApp());

    const passwordHash = await bcrypt.hash('Password1234!', 12);
    const workspaceA = await createWorkspace({ name: 'Family A' });
    const workspaceB = await createWorkspace({ name: 'Family B' });
    workspaceBId = workspaceB.id;

    const userA = await prisma.user.create({
      data: {
        workspaceId: workspaceA.id,
        name: 'Parent A',
        email: `parent-a-${Date.now()}@example.com`,
        passwordHash,
        role: 'parentA'
      }
    });

    const userB = await prisma.user.create({
      data: {
        workspaceId: workspaceB.id,
        name: 'Parent B',
        email: `parent-b-${Date.now()}@example.com`,
        passwordHash,
        role: 'parentA'
      }
    });

    tokenA = await createSessionForUser(userA.id);

    const expenseB = await createExpense({
      workspaceId: workspaceB.id,
      title: 'Secret expense',
      amount: 99,
      category: 'Other',
      paidBy: userB.id,
      splitRatio: 0.5,
      date: new Date().toISOString()
    });
    expenseBId = expenseB.id;
  });

  after(async () => {
    server?.close();
    await prisma.$disconnect();
  });

  it('returns zero expenses from another workspace via API', async () => {
    const res = await request(server, 'GET', '/api/finances/expenses', {
      token: tokenA
    });
    assert.equal(res.status, 200);
    const expenses = res.json.expenses ?? [];
    assert.equal(
      expenses.some((item) => item.id === expenseBId),
      false
    );
  });

  it('blocks direct access to another workspace expense receipt', async () => {
    const res = await request(
      server,
      'GET',
      `/api/finances/expenses/${expenseBId}/receipt`,
      { token: tokenA }
    );
    assert.ok(res.status === 404 || res.status === 403);
  });

  it('never exposes workspaceId as family_id in API payloads', async () => {
    const res = await request(server, 'GET', '/api/finances/expenses', {
      token: tokenA
    });
    assert.equal(res.status, 200);
    const raw = JSON.stringify(res.json);
    assert.equal(raw.includes(workspaceBId), false);
    assert.equal(raw.includes('family_id'), false);
  });
});
