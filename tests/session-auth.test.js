/**
 * Session token hashing and cookie auth.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
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
const { hashSessionToken } = await import('../src/utils/security.js');
const { SESSION_COOKIE } = await import('../src/services/sessionCookie.service.js');

describe('hashSessionToken', () => {
  it('returns stable hex digest', () => {
    const first = hashSessionToken('abc123');
    const second = hashSessionToken('abc123');
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
  });
});

describe('Session cookie auth', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let workspaceId;

  before(async () => {
    server = await listen(createApp());

    const passwordHash = await bcrypt.hash('Password1234!', 12);
    const workspace = await createWorkspace({ name: 'Cookie Auth Family' });
    workspaceId = workspace.id;

    await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: 'Parent Cookie',
        email: `cookie-parent-${Date.now()}@example.com`,
        passwordHash,
        role: 'parentA'
      }
    });
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

  it('stores only tokenHash in database', async () => {
    const user = await prisma.user.findFirst({ where: { workspaceId } });
    const token = await createSessionForUser(user.id);
    const rows = await prisma.session.findMany({ where: { userId: user.id } });

    assert.equal(rows.some((row) => row.tokenHash === hashSessionToken(token)), true);
    assert.equal(JSON.stringify(rows).includes(token), false);
  });

  it('authenticates via session cookie without Bearer header', async () => {
    const login = await request(server, 'POST', '/api/auth/login', {
      body: {
        email: (await prisma.user.findFirst({ where: { workspaceId } })).email,
        password: 'Password1234!'
      }
    });
    assert.equal(login.status, 200);

    const setCookie = login.headers['set-cookie'];
    assert.ok(setCookie);
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    assert.match(cookieHeader, new RegExp(`${SESSION_COOKIE}=`));

    const session = await request(server, 'GET', '/api/auth/session', {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(session.status, 200);
    assert.equal(session.json.user.role, 'parentA');
  });
});
