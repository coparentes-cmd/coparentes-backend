import crypto from 'node:crypto';
import { env } from './env.js';

export function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createInviteCode() {
  return crypto.randomBytes(16).toString('base64url').toUpperCase();
}

export function createIntegrityHash(payload) {
  const data = JSON.stringify(payload);
  if (env.integritySecret) {
    return crypto.createHmac('sha256', env.integritySecret).update(data).digest('hex');
  }
  return crypto.createHash('sha256').update(data).digest('hex');
}
