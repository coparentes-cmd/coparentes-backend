/**
 * Unit tests for hard secret validation (KEY_* + INTEGRITY_SECRET).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  KEYS_REQUIRING_32_BYTES,
  SECRETS_REQUIRING_PRESENCE_ONLY,
  validateRequiredSecrets
} from '../src/utils/secretsValidation.js';
import { TEST_ENCRYPTION_KEYS } from './helpers/encryptionKeys.js';

function validEnv(overrides = {}) {
  return {
    KEY_HEALTH: TEST_ENCRYPTION_KEYS.KEY_HEALTH,
    KEY_FINANCE: TEST_ENCRYPTION_KEYS.KEY_FINANCE,
    KEY_MESSAGES: TEST_ENCRYPTION_KEYS.KEY_MESSAGES,
    KEY_GENERAL: TEST_ENCRYPTION_KEYS.KEY_GENERAL,
    INTEGRITY_SECRET: TEST_ENCRYPTION_KEYS.INTEGRITY_SECRET,
    ...overrides
  };
}

describe('validateRequiredSecrets', () => {
  it('passes when every KEY_* is base64 of exactly 32 bytes and INTEGRITY_SECRET is non-empty', () => {
    assert.doesNotThrow(() => validateRequiredSecrets(validEnv()));
  });

  it('throws with the exact variable name when a KEY_* is missing', () => {
    const env = validEnv();
    delete env.KEY_FINANCE;

    assert.throws(
      () => validateRequiredSecrets(env),
      (err) =>
        err instanceof Error &&
        err.message.includes('KEY_FINANCE is not set')
    );
  });

  it('throws with the exact variable name when INTEGRITY_SECRET is empty', () => {
    assert.throws(
      () => validateRequiredSecrets(validEnv({ INTEGRITY_SECRET: '   ' })),
      (err) =>
        err instanceof Error &&
        err.message.includes('INTEGRITY_SECRET is not set')
    );
  });

  it('throws when INTEGRITY_SECRET is missing', () => {
    const env = validEnv();
    delete env.INTEGRITY_SECRET;

    assert.throws(
      () => validateRequiredSecrets(env),
      (err) =>
        err instanceof Error &&
        err.message.includes('INTEGRITY_SECRET is not set')
    );
  });

  it('throws when a KEY_* decodes to the wrong byte length (e.g. 16)', () => {
    const shortKey = Buffer.alloc(16, 9).toString('base64');

    assert.throws(
      () => validateRequiredSecrets(validEnv({ KEY_HEALTH: shortKey })),
      (err) =>
        err instanceof Error &&
        err.message.includes(
          'KEY_HEALTH must be base64-encoded and decode to exactly 32 bytes, got 16 bytes'
        )
    );
  });

  it('accepts INTEGRITY_SECRET as any non-empty string even when base64-decode is not 32 bytes', () => {
    // 64 hex chars — not a 32-byte AES key after base64 decode; valid as HMAC pepper.
    const hexPepper = crypto.randomBytes(32).toString('hex');
    assert.notEqual(Buffer.from(hexPepper, 'base64').length, 32);

    assert.doesNotThrow(() =>
      validateRequiredSecrets(validEnv({ INTEGRITY_SECRET: hexPepper }))
    );
  });

  it('reports every failing secret name in one error', () => {
    assert.throws(
      () =>
        validateRequiredSecrets({
          KEY_HEALTH: '',
          KEY_FINANCE: Buffer.alloc(24, 1).toString('base64'),
          KEY_MESSAGES: TEST_ENCRYPTION_KEYS.KEY_MESSAGES,
          KEY_GENERAL: TEST_ENCRYPTION_KEYS.KEY_GENERAL,
          INTEGRITY_SECRET: ''
        }),
      (err) =>
        err instanceof Error &&
        err.message.includes('KEY_HEALTH is not set') &&
        err.message.includes(
          'KEY_FINANCE must be base64-encoded and decode to exactly 32 bytes, got 24 bytes'
        ) &&
        err.message.includes('INTEGRITY_SECRET is not set')
    );
  });

  it('covers the split required secret lists', () => {
    assert.deepEqual(KEYS_REQUIRING_32_BYTES, [
      'KEY_HEALTH',
      'KEY_FINANCE',
      'KEY_MESSAGES',
      'KEY_GENERAL'
    ]);
    assert.deepEqual(SECRETS_REQUIRING_PRESENCE_ONLY, ['INTEGRITY_SECRET']);
  });
});
