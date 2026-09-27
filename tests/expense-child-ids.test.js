/**
 * Multi-child expense tagging via ExpenseChild join table.
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

const PASSWORD = 'ExpenseChildren99!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('Expense childIds multi-assign', { skip: !(await dbReady()) }, () => {
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
      await prisma.child.deleteMany({ where: { workspaceId: testWorkspaceId } });
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

  it('creates with two childIds; empty childIds; rejects foreign childId', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const email = `exp-children-${id}@test.coparentes.app`;

    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Expense Children Parent',
        email,
        password: PASSWORD,
        workspaceName: 'Rodzina Expense Children',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    testWorkspaceId = register.json.workspace.id;
    const token = register.json.token;
    const paidBy = register.json.user.id;

    const child1 = await request(server, 'POST', '/api/workspace/children', {
      token,
      body: {
        name: 'Zosia Expense',
        dateOfBirth: '2016-05-12T00:00:00.000Z'
      }
    });
    assert.equal(child1.status, 201, JSON.stringify(child1.json));

    const child2 = await request(server, 'POST', '/api/workspace/children', {
      token,
      body: {
        name: 'Tomek Expense',
        dateOfBirth: '2013-09-07T00:00:00.000Z'
      }
    });
    assert.equal(child2.status, 201, JSON.stringify(child2.json));

    const both = await request(server, 'POST', '/api/finances/expenses', {
      token,
      body: {
        title: 'Wycieczka szkolna',
        amount: 120,
        category: 'Szkoła',
        childIds: [child1.json.id, child2.json.id],
        paidBy,
        splitRatio: 0.5,
        date: new Date().toISOString()
      }
    });
    assert.equal(both.status, 201, JSON.stringify(both.json));
    assert.ok(Array.isArray(both.json.childIds));
    assert.equal(both.json.childIds.length, 2);
    assert.ok(both.json.childIds.includes(child1.json.id));
    assert.ok(both.json.childIds.includes(child2.json.id));
    assert.equal(both.json.splitRatio, 0.5);

    const list = await request(server, 'GET', '/api/finances/expenses', {
      token
    });
    assert.equal(list.status, 200);
    const listed = (list.json.expenses ?? []).find((e) => e.id === both.json.id);
    assert.ok(listed);
    assert.deepEqual(
      [...listed.childIds].sort(),
      [child1.json.id, child2.json.id].sort()
    );

    const empty = await request(server, 'POST', '/api/finances/expenses', {
      token,
      body: {
        title: 'Zakupy rodzinne',
        amount: 45,
        category: 'Jedzenie',
        childIds: [],
        paidBy,
        splitRatio: 0.5,
        date: new Date().toISOString()
      }
    });
    assert.equal(empty.status, 201, JSON.stringify(empty.json));
    assert.deepEqual(empty.json.childIds, []);

    const foreign = await request(server, 'POST', '/api/finances/expenses', {
      token,
      body: {
        title: 'Obcy child',
        amount: 10,
        category: 'Inne',
        childIds: ['clxxxxxxxxxxxxxxxxxxxxxxxxx'],
        paidBy,
        splitRatio: 0.5,
        date: new Date().toISOString()
      }
    });
    assert.equal(foreign.status, 400, JSON.stringify(foreign.json));
    assert.equal(foreign.json.error, 'child_not_found');
  });
});
