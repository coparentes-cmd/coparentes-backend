/**
 * Unit tests for AES-256-GCM field encryption.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.INTEGRITY_SECRET = 'test-integrity-secret';

const { encrypt, decrypt, isEncrypted, CRYPTO_KEYS } = await import(
  '../src/services/crypto.service.js'
);

describe('crypto.service', () => {
  it('encrypts and decrypts roundtrip for each key category', () => {
    for (const keyName of Object.values(CRYPTO_KEYS)) {
      const plaintext = `secret-value-${keyName}`;
      const encrypted = encrypt(plaintext, keyName);
      assert.notEqual(encrypted, plaintext);
      assert.equal(isEncrypted(encrypted), true);
      assert.equal(decrypt(encrypted, keyName), plaintext);
    }
  });

  it('returns plaintext unchanged when value is empty', () => {
    assert.equal(encrypt('', CRYPTO_KEYS.KEY_GENERAL), '');
    assert.equal(decrypt('', CRYPTO_KEYS.KEY_GENERAL), '');
  });

  it('does not double-encrypt already encrypted values', () => {
    const encrypted = encrypt('hello', CRYPTO_KEYS.KEY_MESSAGES);
    assert.equal(encrypt(encrypted, CRYPTO_KEYS.KEY_MESSAGES), encrypted);
  });

  it('passes through legacy plaintext values on decrypt', () => {
    assert.equal(decrypt('legacy-plaintext', CRYPTO_KEYS.KEY_GENERAL), 'legacy-plaintext');
  });
});
