/**
 * F3 billing entitlement API (mobile trial). Skips when Postgres is unavailable.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.OTP_ENABLED = 'false';
process.env.SEED_DEMO_DATA = 'false';
process.env.INTEGRITY_SECRET = 'test-integrity-secret';

const { createApp } = await import('../src/createApp.js');
const { listen, request, dbReady } = await import('./helpers/http.js');
const { prisma } = await import('../src/lib/prisma.js');
const { createWorkspace } = await import('../src/services/workspace.js');
const { createSessionForUser } = await import('../src/services/session.js');

describe('Billing entitlement API', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let workspaceId;
  /** @type {string} */
  let parentId;
  /** @type {string} */
  let childId;
  /** @type {string} */
  let parentToken;
  /** @type {string} */
  let childToken;

  before(async () => {
    server = await listen(createApp());
    const passwordHash = await bcrypt.hash('Password1234!', 12);
    const workspace = await createWorkspace({ name: 'Billing Family' });
    workspaceId = workspace.id;

    const parent = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: 'Parent Billing',
        email: `billing-parent-${Date.now()}@example.com`,
        passwordHash,
        role: 'parentA'
      }
    });
    parentId = parent.id;
    parentToken = await createSessionForUser(parent.id);

    const child = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: 'Child Billing',
        email: `billing-child-${Date.now()}@example.com`,
        passwordHash,
        role: 'child'
      }
    });
    childId = child.id;
    childToken = await createSessionForUser(child.id);
  });

  after(async () => {
    server?.close();
    await prisma.session.deleteMany({
      where: { user: { workspaceId } }
    });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('web entitlement always allows parent without trial', async () => {
    const res = await request(server, 'GET', '/api/billing/entitlement', {
      token: parentToken,
      headers: { 'X-Client-Platform': 'web' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.platform, 'web');
    assert.equal(res.json.accessAllowed, true);
    assert.equal(res.json.billingStatus, 'none');
  });

  it('ios entitlement denies parent before trial', async () => {
    const res = await request(server, 'GET', '/api/billing/entitlement', {
      token: parentToken,
      headers: { 'X-Client-Platform': 'ios' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.platform, 'ios');
    assert.equal(res.json.accessAllowed, false);
  });

  it('start-mobile-trial grants 30-day access on ios', async () => {
    const start = await request(server, 'POST', '/api/billing/start-mobile-trial', {
      token: parentToken,
      headers: { 'X-Client-Platform': 'ios' },
      body: {}
    });
    assert.equal(start.status, 200);
    assert.equal(start.json.started, true);
    assert.equal(start.json.billingStatus, 'trialing');
    assert.equal(start.json.accessAllowed, true);
    assert.ok(start.json.trialEndsAt);
    assert.ok(start.json.user?.billingStatus === 'trialing');

    const again = await request(server, 'POST', '/api/billing/start-mobile-trial', {
      token: parentToken,
      headers: { 'X-Client-Platform': 'ios' },
      body: {}
    });
    assert.equal(again.status, 200);
    assert.equal(again.json.started, false);
    assert.equal(again.json.accessAllowed, true);

    const ent = await request(server, 'GET', '/api/billing/entitlement', {
      token: parentToken,
      headers: { 'X-Client-Platform': 'ios' }
    });
    assert.equal(ent.json.accessAllowed, true);
    assert.equal(ent.json.billingStatus, 'trialing');
  });

  it('child cannot start trial but has ios access', async () => {
    const start = await request(server, 'POST', '/api/billing/start-mobile-trial', {
      token: childToken,
      headers: { 'X-Client-Platform': 'ios' },
      body: {}
    });
    assert.equal(start.status, 403);
    assert.equal(start.json.error, 'child_not_billable');

    const ent = await request(server, 'GET', '/api/billing/entitlement', {
      token: childToken,
      headers: { 'X-Client-Platform': 'ios' }
    });
    assert.equal(ent.status, 200);
    assert.equal(ent.json.accessAllowed, true);
  });

  it('session serializeUser includes billing fields', async () => {
    const res = await request(server, 'GET', '/api/auth/session', {
      token: parentToken
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.billingStatus, 'trialing');
    assert.ok(res.json.user.trialEndsAt);
  });

  it('expired trial cannot be restarted', async () => {
    await prisma.user.update({
      where: { id: parentId },
      data: {
        billingStatus: 'expired',
        trialEndsAt: new Date(Date.now() - 86400000)
      }
    });
    const start = await request(server, 'POST', '/api/billing/start-mobile-trial', {
      token: parentToken,
      headers: { 'X-Client-Platform': 'ios' },
      body: {}
    });
    assert.equal(start.status, 409);
    assert.equal(start.json.error, 'trial_already_used');

    // restore for cleanup clarity
    void childId;
  });
});
