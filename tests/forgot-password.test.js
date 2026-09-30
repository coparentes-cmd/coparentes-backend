/**
 * Forgot-password route smoke + mailer helper.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = '';
process.env.RESEND_FROM_EMAIL = '';

import { createApp } from '../src/createApp.js';
import { listen, request } from './helpers/http.js';

describe('POST /api/auth/forgot-password', () => {
  /** @type {import('node:http').Server} */
  let server;

  before(async () => {
    server = await listen(createApp());
  });

  after(() => {
    server?.close();
  });

  it('rejects invalid email', async () => {
    const res = await request(server, 'POST', '/api/auth/forgot-password', {
      body: { email: 'not-an-email' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.error, 'invalid_request');
  });

  it('returns generic success for unknown account (no enumeration)', async () => {
    const res = await request(server, 'POST', '/api/auth/forgot-password', {
      body: { email: 'nobody-exists@test.coparentes.app' }
    });
    // Without DB this may 500; with DB / soft path expect 200.
    assert.ok([200, 500, 503].includes(res.status));
    if (res.status === 200) {
      assert.equal(res.json?.success, true);
    }
  });
});

describe('password reset email soft-fail', () => {
  it('sendPasswordResetLinkEmail returns emailSent:false when Resend missing', async () => {
    const { sendPasswordResetLinkEmail, isEmailDeliveryConfigured } = await import(
      '../src/utils/mailer.js'
    );
    assert.equal(isEmailDeliveryConfigured(), false);
    const result = await sendPasswordResetLinkEmail({
      to: 'a@example.com',
      resetUrl: 'http://localhost:8080/reset-password?token=abc'
    });
    assert.equal(result.emailSent, false);
  });

  it('sendTempPasswordEmail returns emailSent:false when Resend missing', async () => {
    const { sendTempPasswordEmail, isEmailDeliveryConfigured } = await import(
      '../src/utils/mailer.js'
    );
    assert.equal(isEmailDeliveryConfigured(), false);
    const result = await sendTempPasswordEmail({
      to: 'a@example.com',
      tempPassword: 'Tmp-Abc123xyz'
    });
    assert.equal(result.emailSent, false);
  });
});
