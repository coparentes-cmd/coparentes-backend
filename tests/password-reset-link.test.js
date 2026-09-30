/**
 * Password reset via one-time link token (no immediate temp password).
 */
import { describe, it, before, after } from 'node:test';
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
import { getStubLastPasswordResetToken } from '../src/utils/mailer.js';
import { hashPasswordResetToken } from '../src/utils/security.js';
import { createSessionForUser } from '../src/services/session.js';

const INITIAL_PASSWORD = 'Initial1!';
const NEW_PASSWORD = 'BrandNew9!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('password reset link flow', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string | null} */
  let workspaceId = null;
  /** @type {string} */
  let email;
  /** @type {string | null} */
  let userId = null;

  before(async () => {
    server = await listen(createApp());
    email = `pwreset-${Date.now()}@test.coparentes.app`;
  });

  after(async () => {
    server?.close();
    if (userId) {
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
      await prisma.session.deleteMany({ where: { userId } });
    }
    if (workspaceId) {
      await prisma.userConsent.deleteMany({
        where: { user: { workspaceId } }
      });
      await prisma.user.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('forgot-password for existing user stores hashed token without changing password', async () => {
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Reset Link User',
        email,
        password: INITIAL_PASSWORD,
        workspaceName: 'Reset Link Family',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    workspaceId = register.json.workspace.id;
    userId = register.json.user.id;

    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });
    assert.ok(before?.passwordHash);

    const forgot = await request(server, 'POST', '/api/auth/forgot-password', {
      body: { email }
    });
    assert.equal(forgot.status, 200, JSON.stringify(forgot.json));
    assert.equal(forgot.json.success, true);

    const after = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });
    assert.equal(after.passwordHash, before.passwordHash);

    const rawToken = getStubLastPasswordResetToken();
    assert.ok(rawToken && rawToken.length >= 32, 'stub captured reset token');

    const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tokenHash, hashPasswordResetToken(rawToken));
    assert.equal(rows[0].usedAt, null);

    const ttlMs = rows[0].expiresAt.getTime() - Date.now();
    assert.ok(ttlMs > 55 * 60 * 1000 && ttlMs <= 60 * 60 * 1000 + 5000);
  });

  it('forgot-password for unknown email returns generic success with no tokens', async () => {
    const beforeCount = await prisma.passwordResetToken.count();
    const res = await request(server, 'POST', '/api/auth/forgot-password', {
      body: { email: `nobody-${Date.now()}@test.coparentes.app` }
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.success, true);
    assert.equal(await prisma.passwordResetToken.count(), beforeCount);
  });

  it('confirm with fresh token changes password, marks used, clears sessions', async () => {
    assert.ok(userId);
    await createSessionForUser(userId);
    const sessionsBefore = await prisma.session.count({ where: { userId } });
    assert.ok(sessionsBefore >= 1);

    const rawToken = getStubLastPasswordResetToken();
    assert.ok(rawToken);

    const confirm = await request(server, 'POST', '/api/auth/reset-password/confirm', {
      body: { token: rawToken, newPassword: NEW_PASSWORD }
    });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.json));
    assert.equal(confirm.json.success, true);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, mustChangePassword: true }
    });
    assert.equal(user.mustChangePassword, false);
    assert.equal(await bcrypt.compare(NEW_PASSWORD, user.passwordHash), true);
    assert.equal(await bcrypt.compare(INITIAL_PASSWORD, user.passwordHash), false);

    const tokenRow = await prisma.passwordResetToken.findFirst({
      where: { tokenHash: hashPasswordResetToken(rawToken) }
    });
    assert.ok(tokenRow?.usedAt);

    assert.equal(await prisma.session.count({ where: { userId } }), 0);

    const oldLogin = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: INITIAL_PASSWORD }
    });
    assert.ok([401, 400].includes(oldLogin.status));

    const newLogin = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: NEW_PASSWORD }
    });
    assert.equal(newLogin.status, 200, JSON.stringify(newLogin.json));
    assert.ok(newLogin.json.token);
  });

  it('confirm with already-used token returns invalid_or_expired_token', async () => {
    const rawToken = getStubLastPasswordResetToken();
    assert.ok(rawToken);
    const res = await request(server, 'POST', '/api/auth/reset-password/confirm', {
      body: { token: rawToken, newPassword: 'AnotherPass1!' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'invalid_or_expired_token');
  });

  it('two parallel confirms with the same token: exactly one 200 and one 400', async () => {
    // Self-contained so this case can be run in isolation (--test-name-pattern).
    const raceEmail = `pwreset-race-${Date.now()}@test.coparentes.app`;
    let raceWorkspaceId = null;
    let raceUserId = null;

    try {
      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Race Reset User',
          email: raceEmail,
          password: INITIAL_PASSWORD,
          workspaceName: 'Race Reset Family',
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      raceWorkspaceId = register.json.workspace.id;
      raceUserId = register.json.user.id;

      const forgot = await request(server, 'POST', '/api/auth/forgot-password', {
        body: { email: raceEmail }
      });
      assert.equal(forgot.status, 200);
      const rawToken = getStubLastPasswordResetToken();
      assert.ok(rawToken);

      const [a, b] = await Promise.all([
        request(server, 'POST', '/api/auth/reset-password/confirm', {
          body: { token: rawToken, newPassword: 'ParallelWin1!' }
        }),
        request(server, 'POST', '/api/auth/reset-password/confirm', {
          body: { token: rawToken, newPassword: 'ParallelLose1!' }
        })
      ]);

      const statuses = [a.status, b.status].sort();
      assert.deepEqual(
        statuses,
        [200, 400],
        JSON.stringify({ a: { status: a.status, json: a.json }, b: { status: b.status, json: b.json } })
      );

      const winner = a.status === 200 ? a : b;
      const loser = a.status === 400 ? a : b;
      assert.equal(winner.json.success, true);
      assert.equal(loser.json.error, 'invalid_or_expired_token');

      const winnerPassword =
        a.status === 200 ? 'ParallelWin1!' : 'ParallelLose1!';
      const loserPassword =
        a.status === 200 ? 'ParallelLose1!' : 'ParallelWin1!';

      const user = await prisma.user.findUnique({
        where: { id: raceUserId },
        select: { passwordHash: true }
      });
      assert.equal(await bcrypt.compare(winnerPassword, user.passwordHash), true);
      assert.equal(await bcrypt.compare(loserPassword, user.passwordHash), false);

      const tokenRow = await prisma.passwordResetToken.findFirst({
        where: { tokenHash: hashPasswordResetToken(rawToken) }
      });
      assert.ok(tokenRow?.usedAt);
    } finally {
      if (raceUserId) {
        await prisma.passwordResetToken.deleteMany({ where: { userId: raceUserId } });
        await prisma.session.deleteMany({ where: { userId: raceUserId } });
      }
      if (raceWorkspaceId) {
        await prisma.userConsent.deleteMany({
          where: { user: { workspaceId: raceWorkspaceId } }
        });
        await prisma.user.deleteMany({ where: { workspaceId: raceWorkspaceId } });
        await prisma.workspace
          .delete({ where: { id: raceWorkspaceId } })
          .catch(() => {});
      }
    }
  });

  it('confirm with expired token returns invalid_or_expired_token', async () => {
    assert.ok(userId);
    const forgot = await request(server, 'POST', '/api/auth/forgot-password', {
      body: { email }
    });
    assert.equal(forgot.status, 200);

    const rawToken = getStubLastPasswordResetToken();
    assert.ok(rawToken);
    const tokenHash = hashPasswordResetToken(rawToken);

    await prisma.passwordResetToken.updateMany({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 60_000) }
    });

    const res = await request(server, 'POST', '/api/auth/reset-password/confirm', {
      body: { token: rawToken, newPassword: 'ExpiredTry1!' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'invalid_or_expired_token');
  });

  it('confirm with random token returns invalid_or_expired_token', async () => {
    const res = await request(server, 'POST', '/api/auth/reset-password/confirm', {
      body: {
        token: 'a'.repeat(64),
        newPassword: 'RandomFail1!'
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'invalid_or_expired_token');
  });

  it('second forgot-password invalidates the first token', async () => {
    assert.ok(userId);

    const firstForgot = await request(server, 'POST', '/api/auth/forgot-password', {
      body: { email }
    });
    assert.equal(firstForgot.status, 200);
    const firstToken = getStubLastPasswordResetToken();
    assert.ok(firstToken);

    const secondForgot = await request(server, 'POST', '/api/auth/forgot-password', {
      body: { email }
    });
    assert.equal(secondForgot.status, 200);
    const secondToken = getStubLastPasswordResetToken();
    assert.ok(secondToken);
    assert.notEqual(firstToken, secondToken);

    const active = await prisma.passwordResetToken.findMany({
      where: { userId, usedAt: null }
    });
    assert.equal(active.length, 1);
    assert.equal(active[0].tokenHash, hashPasswordResetToken(secondToken));

    const reuseFirst = await request(server, 'POST', '/api/auth/reset-password/confirm', {
      body: { token: firstToken, newPassword: 'ShouldFail1!' }
    });
    assert.equal(reuseFirst.status, 400);
    assert.equal(reuseFirst.json.error, 'invalid_or_expired_token');

    const useSecond = await request(server, 'POST', '/api/auth/reset-password/confirm', {
      body: { token: secondToken, newPassword: 'SecondWorks1!' }
    });
    assert.equal(useSecond.status, 200, JSON.stringify(useSecond.json));

    const login = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: 'SecondWorks1!' }
    });
    assert.equal(login.status, 200);
  });
});
