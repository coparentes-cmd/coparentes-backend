import crypto from 'crypto';
import { env } from '../utils/env.js';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export const CRYPTO_KEYS = {
  KEY_HEALTH: 'KEY_HEALTH',
  KEY_FINANCE: 'KEY_FINANCE',
  KEY_MESSAGES: 'KEY_MESSAGES',
  KEY_GENERAL: 'KEY_GENERAL'
};

function resolveKeyMaterial(keyName) {
  const configured = env.encryptionKeys[keyName];
  if (configured) {
    return Buffer.from(configured, 'base64');
  }

  if (env.nodeEnv === 'production') {
    throw new Error(`Missing encryption key: ${keyName}`);
  }

  const fallbackSeed = env.integritySecret || 'coparentes-dev-only-key';
  return crypto
    .createHash('sha256')
    .update(`${fallbackSeed}:${keyName}`)
    .digest();
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encrypt(data, keyName) {
  if (data == null || data === '') {
    return data;
  }

  const plaintext = String(data);
  if (isEncrypted(plaintext)) {
    return plaintext;
  }

  const key = resolveKeyMaterial(keyName);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${keyName}:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decrypt(data, keyName) {
  if (data == null || data === '') {
    return data;
  }

  const value = String(data);
  if (!isEncrypted(value)) {
    return value;
  }

  const payload = value.slice(PREFIX.length);
  const [storedKeyName, ivPart, tagPart, cipherPart] = payload.split(':');
  if (!storedKeyName || !ivPart || !tagPart || !cipherPart) {
    throw new Error('invalid_encrypted_payload');
  }

  const key = resolveKeyMaterial(storedKeyName || keyName);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivPart, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherPart, 'base64url')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

export function encryptOptional(value, keyName) {
  return value == null || value === '' ? value : encrypt(value, keyName);
}

export function decryptOptional(value, keyName) {
  return value == null || value === '' ? value : decrypt(value, keyName);
}

export function documentContentKey(category) {
  const normalized = String(category ?? '').toLowerCase();
  if (normalized === 'medical') {
    return CRYPTO_KEYS.KEY_HEALTH;
  }
  return CRYPTO_KEYS.KEY_GENERAL;
}

export function calendarEventKey(type) {
  return type === 'medical' ? CRYPTO_KEYS.KEY_HEALTH : CRYPTO_KEYS.KEY_GENERAL;
}
