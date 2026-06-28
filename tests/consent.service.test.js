/**
 * Unit tests for GDPR consent service.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.INTEGRITY_SECRET = 'test-integrity-secret';

const {
  hashIpAddress,
  validateRequiredConsents,
  normalizeConsentsPayload,
  REQUIRED_CONSENT_TYPES,
  ALL_CONSENT_TYPES
} = await import('../src/services/consent.service.js');

describe('consent.service', () => {
  it('hashes IP addresses and never returns raw IP', () => {
    const hash = hashIpAddress('192.168.1.1');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.notEqual(hash, '192.168.1.1');
    assert.equal(hashIpAddress('192.168.1.1'), hash);
    assert.notEqual(hashIpAddress('10.0.0.1'), hash);
  });

  it('validates required consents', () => {
    const valid = {
      TERMS: true,
      DATA_PROCESSING: true,
      CHILD_DATA: true,
      EMAIL_NOTIFICATIONS: false,
      MARKETING: false,
      ANALYTICS: false
    };
    assert.deepEqual(validateRequiredConsents(valid), { ok: true });

    const missing = { ...valid, TERMS: false };
    assert.deepEqual(validateRequiredConsents(missing), {
      ok: false,
      error: 'required_consents_missing'
    });

    assert.deepEqual(validateRequiredConsents(null), {
      ok: false,
      error: 'required_consents_missing'
    });
  });

  it('normalizes consent payload with all six types', () => {
    const normalized = normalizeConsentsPayload({
      TERMS: true,
      DATA_PROCESSING: true,
      CHILD_DATA: true,
      EMAIL_NOTIFICATIONS: true
    });

    for (const type of ALL_CONSENT_TYPES) {
      assert.ok(Object.hasOwn(normalized, type));
    }
    assert.equal(normalized.TERMS, true);
    assert.equal(normalized.MARKETING, false);
    assert.equal(normalized.ANALYTICS, false);
  });

  it('marks exactly three consent types as required', () => {
    assert.equal(REQUIRED_CONSENT_TYPES.length, 3);
    assert.deepEqual(REQUIRED_CONSENT_TYPES, [
      'TERMS',
      'DATA_PROCESSING',
      'CHILD_DATA'
    ]);
  });
});
