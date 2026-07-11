/**
 * RBAC: child role must not read parent-only resources.
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

const dbAvailable = await dbReady();

describe('Child read RBAC', { skip: !dbAvailable }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let childToken;
  /** @type {string} */
  let parentToken;
  /** @type {string} */
  let observerToken;
  /** @type {string} */
  let workspaceId;

  before(async () => {
    server = await listen(createApp());

    const passwordHash = await bcrypt.hash('Password1234!', 12);
    const workspace = await createWorkspace({ name: 'RBAC Family' });
    workspaceId = workspace.id;

    const parent = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: 'Parent A',
        email: `rbac-parent-${Date.now()}@example.com`,
        passwordHash,
        role: 'parentA'
      }
    });

    const child = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: 'Child',
        email: `rbac-child-${Date.now()}@example.com`,
        passwordHash,
        role: 'child'
      }
    });

    const observer = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: 'Observer',
        email: `rbac-observer-${Date.now()}@example.com`,
        passwordHash,
        role: 'observer'
      }
    });

    parentToken = await createSessionForUser(parent.id);
    childToken = await createSessionForUser(child.id);
    observerToken = await createSessionForUser(observer.id);
  });

  after(async () => {
    server?.close();
    await prisma.messageUserTag.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('blocks child from listing exports', async () => {
    const res = await request(server, 'GET', '/api/exports', { token: childToken });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'forbidden');
  });

  it('allows parent to list exports', async () => {
    const res = await request(server, 'GET', '/api/exports', { token: parentToken });
    assert.equal(res.status, 200);
  });

  it('allows observer to list exports', async () => {
    const res = await request(server, 'GET', '/api/exports', { token: observerToken });
    assert.equal(res.status, 200);
  });

  it('blocks child from listing finances', async () => {
    const res = await request(server, 'GET', '/api/finances/expenses', {
      token: childToken
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'forbidden');
  });

  it('allows parent to list finances', async () => {
    const res = await request(server, 'GET', '/api/finances/expenses', {
      token: parentToken
    });
    assert.equal(res.status, 200);
  });

  it('allows observer to list finances', async () => {
    const res = await request(server, 'GET', '/api/finances/expenses', {
      token: observerToken
    });
    assert.equal(res.status, 200);
  });

  it('blocks child from listing documents', async () => {
    const res = await request(server, 'GET', '/api/documents', { token: childToken });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'forbidden');
  });
});
