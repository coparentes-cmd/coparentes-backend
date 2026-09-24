/**
 * Integration tests: OTP login rate limits (verify per-user + issue + login email).
 * Framework: node:test (same as the rest of the backend).
 *
 * Behaviour note (scenario 2): otpVerifyLimiter allows 5 attempts (max: 5), then
 * the next request is 429. So wrong OTP #1–#5 → 401 (or business 429 otp_locked),
 * #6+ → rate-limit 429. (If product intent was “5th call is 429”, max would be 4.)
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
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

describe('OTP / login rate limits', { skip: !(await dbReady()) }, () => {
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

  it('1) correct password → requiresOtp, not 429', async () => {
    const res = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: PASSWORD }
    });

    assert.equal(isRateLimited(res), false);
    assert.equal(res.status, 200);
    assert.equal(res.json?.requiresOtp, true);
    assert.equal(typeof res.json?.challengeId, 'string');
    assert.ok(res.json.challengeId.length >= 8);
  });

  it('2+3) five wrong verifies then 429; new challenge still blocked', async () => {
    const login = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: PASSWORD }
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const challengeId = login.json.challengeId;

    // Product limiter: 5 allowed attempts, then lock → 6th is rate-limit 429.
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server, 'POST', '/api/auth/login/verify-otp', {
        body: { challengeId, code: '000000' }
      });
      assert.equal(isRateLimited(res), false, `attempt ${i + 1} should not be rate-limited yet`);
      assert.ok(
        [400, 401].includes(res.status) ||
          (res.status === 429 && res.json?.error === 'otp_locked'),
        `attempt ${i + 1}: unexpected ${res.status} ${JSON.stringify(res.json)}`
      );
    }

    const sixth = await request(server, 'POST', '/api/auth/login/verify-otp', {
      body: { challengeId, code: '000000' }
    });
    assert.equal(isRateLimited(sixth), true, '6th verify must be rate-limited');

    // Resend may succeed (separate issue bucket); verify with new id must stay locked.
    const resend = await request(server, 'POST', '/api/auth/login/resend-otp', {
      body: { challengeId }
    });
    assert.ok(
      resend.status === 200 || isRateLimited(resend),
      `resend unexpected: ${resend.status} ${JSON.stringify(resend.json)}`
    );

    const nextChallengeId =
      resend.status === 200 ? resend.json.challengeId : challengeId;

    const afterResend = await request(server, 'POST', '/api/auth/login/verify-otp', {
      body: { challengeId: nextChallengeId, code: '111111' }
    });
    assert.equal(
      isRateLimited(afterResend),
      true,
      'verify after new challenge must still be rate-limited (per-user)'
    );
  });

  it('4) OTP issue limit: 4th successful-password login is 429', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await request(server, 'POST', '/api/auth/login', {
        body: { email, password: PASSWORD },
        headers: { 'X-Forwarded-For': `203.0.113.${10 + i}` }
      });
      assert.equal(res.status, 200, `login ${i + 1}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json?.requiresOtp, true);
    }

    const fourth = await request(server, 'POST', '/api/auth/login', {
      body: { email, password: PASSWORD },
      headers: { 'X-Forwarded-For': '203.0.113.99' }
    });
    assert.equal(isRateLimited(fourth), true);
    assert.equal(fourth.json?.requiresOtp, undefined);
  });

  it('5) loginEmailLimiter: 6th wrong password blocked (same email, varying IP)', async () => {
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
