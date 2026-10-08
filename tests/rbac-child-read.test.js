/**
 * RBAC: child role must not read parent-only resources.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
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
  let observerId;
  /** @type {string} */
  let observerEmail;
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

    observerEmail = `rbac-observer-${Date.now()}@example.com`;
    const observer = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: 'Observer',
        email: observerEmail,
        passwordHash,
        role: 'observer'
      }
    });
    observerId = observer.id;

    parentToken = await createSessionForUser(parent.id);
    childToken = await createSessionForUser(child.id);
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

  it('blocks retired observer role from listing exports', async () => {
    const token = await createSessionForUser(observerId);
    const res = await request(server, 'GET', '/api/exports', { token });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'role_not_supported');
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

  it('blocks retired observer role from listing finances', async () => {
    const token = await createSessionForUser(observerId);
    const res = await request(server, 'GET', '/api/finances/expenses', {
      token
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'role_not_supported');
  });

  it('blocks child from listing documents', async () => {
    const res = await request(server, 'GET', '/api/documents', { token: childToken });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'forbidden');
  });

  it('rejects login for retired observer role', async () => {
    const res = await request(server, 'POST', '/api/auth/login', {
      body: {
        email: observerEmail,
        password: 'Password1234!'
      }
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'role_not_supported');
  });
});
