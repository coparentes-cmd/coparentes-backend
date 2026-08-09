/**
 * Invite email soft-fail + join-code content helpers.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';

describe('sendInviteEmail soft-fail', () => {
  let previousKey;
  let previousFrom;

  beforeEach(() => {
    previousKey = process.env.RESEND_API_KEY;
    previousFrom = process.env.RESEND_FROM_EMAIL;
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = previousKey;
    process.env.RESEND_FROM_EMAIL = previousFrom;
  });

  it('returns emailSent:false when Resend is not configured (no throw)', async () => {
    process.env.RESEND_API_KEY = '';
    process.env.RESEND_FROM_EMAIL = '';

    const { sendInviteEmail, isEmailDeliveryConfigured } = await import(
      '../src/utils/mailer.js'
    );

    assert.equal(isEmailDeliveryConfigured(), false);

    const result = await sendInviteEmail({
      to: 'partner@example.com',
      acceptUrl: 'https://getcoparentes.app/invite/accept/abc',
      inviterEmail: 'anna@example.com',
      inviteCode: 'RODZINA-AB12',
      workspaceName: 'Rodzina Test'
    });

    assert.equal(result.emailSent, false);
    assert.equal(result.skipped, true);
  });

  it('returns emailSent:false when Resend rejects the key (no throw)', async () => {
    process.env.RESEND_API_KEY = 're_invalid_test_key';
    process.env.RESEND_FROM_EMAIL = 'Coparentes <noreply@getcoparentes.app>';

    const { sendInviteEmail, isEmailDeliveryConfigured } = await import(
      '../src/utils/mailer.js'
    );

    assert.equal(isEmailDeliveryConfigured(), true);

    const result = await sendInviteEmail({
      to: 'partner@example.com',
      acceptUrl: 'https://getcoparentes.app/invite/accept/abc',
      inviterEmail: 'anna@example.com',
      inviteCode: 'KOD-1234',
      workspaceName: 'Rodzina'
    });

    assert.equal(result.emailSent, false);
    assert.ok(result.skipped === true || result.error);
  });
});

describe('invite email HTML escaping', () => {
  it('escapes HTML in invite payloads', async () => {
    const { escapeHtml } = await import('../src/utils/mailer.js');
    assert.equal(escapeHtml('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
  });
});
