/**
 * Unit tests for AES-256-GCM field encryption.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';

import { ensureTestEncryptionKeys, TEST_ENCRYPTION_KEYS } from './helpers/encryptionKeys.js';

ensureTestEncryptionKeys();

const { encrypt, decrypt, isEncrypted, CRYPTO_KEYS } = await import(
  '../src/services/crypto.service.js'
);

describe('crypto.service', () => {
  before(() => {
    ensureTestEncryptionKeys();
  });

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

  it('throws when KEY_* is missing (no INTEGRITY_SECRET / JWT fallback)', () => {
    const previous = process.env.KEY_MESSAGES;
    delete process.env.KEY_MESSAGES;
    try {
      assert.throws(
        () => encrypt('secret', CRYPTO_KEYS.KEY_MESSAGES),
        (err) =>
          err instanceof Error &&
          err.message.includes('Missing encryption key: KEY_MESSAGES')
      );
    } finally {
      process.env.KEY_MESSAGES = previous ?? TEST_ENCRYPTION_KEYS.KEY_MESSAGES;
    }
  });

  it('throws when KEY_* is not 32 bytes after base64 decode', () => {
    const previous = process.env.KEY_MESSAGES;
    process.env.KEY_MESSAGES = Buffer.alloc(16, 9).toString('base64');
    try {
      assert.throws(
        () => encrypt('secret', CRYPTO_KEYS.KEY_MESSAGES),
        (err) =>
          err instanceof Error &&
          err.message.includes('Invalid encryption key: KEY_MESSAGES')
      );
    } finally {
      process.env.KEY_MESSAGES = previous ?? TEST_ENCRYPTION_KEYS.KEY_MESSAGES;
    }
  });
});
