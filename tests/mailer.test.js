/**
 * Mailer configuration tests.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';

describe('mailer configuration', () => {
  before(() => {
    process.env.RESEND_API_KEY = 're_live_test';
    process.env.RESEND_FROM_EMAIL = 'Coparentes <noreply@getcoparentes.app>';
  });

  it('detects configured Resend credentials', async () => {
    const { isEmailDeliveryConfigured } = await import('../src/utils/mailer.js');
    assert.equal(isEmailDeliveryConfigured(), true);
  });
});
