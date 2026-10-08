/**
 * Login rate limits after 2FA / OTP product path retirement.
 * OTP challenge issuance is disabled; password login issues a session directly.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.OTP_ENABLED = 'true';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.OTP_MAX_ATTEMPTS = '5';
process.env.SEED_DEMO_DATA = 'false';
process.env.INTEGRITY_SECRET = 'test-integrity-secret';
process.env.RESEND_API_KEY = 're_test_stub_key';
process.env.RESEND_FROM_EMAIL = 'Coparentes <noreply@coparentes.app>';
process.env.MAILER_STUB_SUCCESS = 'true';

const { createApp } = await import('../src/createApp.js');
const { listen, request, dbReady } = await import('./helpers/http.js');
const { prisma } = await import('../src/lib/prisma.js');
const { createWorkspace } = await import('../src/services/workspace.js');
const { resetOtpRateLimitsForTests } = await import(
  '../src/middleware/otpRateLimit.js'
);
const { resetAuthRateLimitersForTests } = await import('../src/routes/auth.js');

const PASSWORD = 'OtpRateLimit1!';
const RATE_MSG = 'Too many requests, try again later';

async function resetLimiters() {
  resetOtpRateLimitsForTests();
  await resetAuthRateLimitersForTests();
}

function isRateLimited(res) {
  return res.status === 429 && res.json?.error === RATE_MSG;
}

describe('Login rate limits (OTP retired)', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let workspaceId;
  /** @type {string} */
  let email;

  before(async () => {
    server = await listen(createApp());

    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const workspace = await createWorkspace({ name: 'OTP Rate Limit Family' });
    workspaceId = workspace.id;
    email = `otp-rate-${Date.now()}@example.com`;

    await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: 'OTP Rate Parent',
        email,
        passwordHash,
        role: 'parentA',
        // Legacy flag — must not trigger OTP after retirement.
        twoFactorEnabled: true
      }
    });
  });

  after(async () => {
    server?.close();
    await prisma.loginOtpChallenge.deleteMany({
      where: { user: { workspaceId } }
    });
    await prisma.session.deleteMany({ where: { user: { workspaceId } } });
    await prisma.trustedDevice.deleteMany({
      where: { user: { workspaceId } }
    }).catch(() => {});
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetLimiters();
    await prisma.loginOtpChallenge.deleteMany({
      where: { user: { workspaceId } }
    });
  });

  it('correct password issues session without OTP challenge', async () => {
    const res = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: PASSWORD }
    });

    assert.equal(isRateLimited(res), false);
    assert.equal(res.status, 200);
    assert.equal(res.json?.requiresOtp, undefined);
    assert.ok(res.json?.token, 'session token required');
    assert.ok(res.json?.user?.id);
  });

  it('loginEmailLimiter: 6th wrong password blocked (same email, varying IP)', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server, 'POST', '/api/auth/login', {
        body: { email, password: 'WrongPassword99!' },
        headers: { 'X-Forwarded-For': `198.51.100.${i + 1}` }
      });
      assert.equal(isRateLimited(res), false, `wrong login ${i + 1}`);
      assert.equal(res.status, 401);
      assert.equal(res.json?.error, 'invalid_credentials');
    }

    const sixth = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: 'WrongPassword99!' },
      headers: { 'X-Forwarded-For': '198.51.100.200' }
    });
    assert.equal(isRateLimited(sixth), true);
  });
});
