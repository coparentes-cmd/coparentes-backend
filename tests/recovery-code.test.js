/**
 * Unit tests for Crockford Base32 recovery codes (no DB).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';

const {
  CROCKFORD_ALPHABET,
  encodeCrockfordBase32,
  createRecoveryCode
} = await import('../src/utils/security.js');

describe('createRecoveryCode (Crockford Base32)', () => {
  it('alphabet excludes I, L, O, U', () => {
    assert.equal(CROCKFORD_ALPHABET.length, 32);
    assert.equal(CROCKFORD_ALPHABET.includes('I'), false);
    assert.equal(CROCKFORD_ALPHABET.includes('L'), false);
    assert.equal(CROCKFORD_ALPHABET.includes('O'), false);
    assert.equal(CROCKFORD_ALPHABET.includes('U'), false);
  });

  it('encodeCrockfordBase32: 15 bytes → 24 symbols', () => {
    const zeros = Buffer.alloc(15, 0);
    const encoded = encodeCrockfordBase32(zeros);
    assert.equal(encoded.length, 24);
    assert.equal(encoded, '0'.repeat(24));
  });

  it('createRecoveryCode format: 6 groups of 4 Crockford symbols', () => {
    const code = createRecoveryCode();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/);
    const compact = code.replace(/-/g, '');
    assert.equal(compact.length, 24);
    for (const ch of compact) {
      assert.ok(CROCKFORD_ALPHABET.includes(ch), `unexpected char: ${ch}`);
    }
  });

  it('createRecoveryCode yields distinct codes', () => {
    const a = createRecoveryCode();
    const b = createRecoveryCode();
    assert.notEqual(a, b);
  });
});
