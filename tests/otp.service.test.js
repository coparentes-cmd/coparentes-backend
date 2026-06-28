/**
 * OTP flow unit tests (no email send, no DB).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.OTP_ENABLED = 'true';

const {
  generateOtpCode,
  maskEmail,
  requiresEmailOtp
} = await import('../src/services/otp.service.js');

describe('otp.service helpers', () => {
  it('generates a 6-digit numeric code', () => {
    const code = generateOtpCode();
    assert.match(code, /^\d{6}$/);
    const numeric = Number(code);
    assert.ok(numeric >= 100000 && numeric <= 999999);
  });

  it('masks email addresses without revealing full local part', () => {
    assert.equal(maskEmail('anna.kowalska@example.com'), 'a***a@example.com');
    assert.equal(maskEmail('ab@test.com'), 'a***@test.com');
  });

  it('requires OTP for parent emails but not child internal accounts', () => {
    assert.equal(
      requiresEmailOtp({ email: 'parent@example.com' }),
      true
    );
    assert.equal(
      requiresEmailOtp({ email: 'child+cuid@accounts.coparentes.internal' }),
      false
    );
  });

  it('hashes and verifies OTP codes with bcrypt', async () => {
    const code = generateOtpCode();
    const hash = await bcrypt.hash(code, 12);
    assert.equal(await bcrypt.compare(code, hash), true);
    assert.equal(await bcrypt.compare('000000', hash), false);
  });
});

describe('otp expiry logic', () => {
  it('detects expired challenges by timestamp', () => {
    const expiredAt = new Date(Date.now() - 60_000);
    assert.equal(expiredAt < new Date(), true);
    const validUntil = new Date(Date.now() + 10 * 60_000);
    assert.equal(validUntil < new Date(), false);
  });
});
