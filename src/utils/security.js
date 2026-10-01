import crypto from 'node:crypto';
import { env } from './env.js';

export function createToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function createInviteCode() {
  return crypto.randomBytes(16).toString('base64url').toUpperCase();
}

/**
 * Crockford Base32 alphabet — excludes I, L, O, U (avoids 0/O, 1/I/L confusion).
 * @see https://www.crockford.com/base32.html
 */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Encode raw bytes as Crockford Base32 (no padding).
 * Output length = ceil(bytes.length * 8 / 5).
 */
export function encodeCrockfordBase32(bytes) {
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) {
    throw new TypeError('encodeCrockfordBase32 expects Buffer or Uint8Array');
  }
  const src = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < src.length; i += 1) {
    value = (value << 8) | src[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += CROCKFORD_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Human-typed E2E recovery code: 120 bits of entropy as Crockford Base32,
 * grouped XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (24 symbols + hyphens).
 */
export function createRecoveryCode() {
  const raw = crypto.randomBytes(15); // 120 bits → exactly 24 Crockford chars
  const encoded = encodeCrockfordBase32(raw);
  if (encoded.length !== 24) {
    throw new Error(
      `createRecoveryCode: expected 24 symbols, got ${encoded.length}`
    );
  }
  return encoded.match(/.{1,4}/g).join('-');
}

function sessionPepper() {
  return env.sessionPepper || env.integritySecret || 'dev-session-pepper';
}

export function hashSessionToken(token) {
  return crypto.createHmac('sha256', sessionPepper()).update(token).digest('hex');
}

/** HMAC for password-reset link tokens — same pepper as sessions, distinct purpose prefix. */
export function hashPasswordResetToken(token) {
  return crypto
    .createHmac('sha256', sessionPepper())
    .update(`pwreset:${token}`)
    .digest('hex');
}

export function createIntegrityHash(payload) {
  const data = JSON.stringify(payload);
  if (env.integritySecret) {
    return crypto.createHmac('sha256', env.integritySecret).update(data).digest('hex');
  }
  return crypto.createHash('sha256').update(data).digest('hex');
}
