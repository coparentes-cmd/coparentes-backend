/**
 * Hard startup checks for field-encryption keys and INTEGRITY_SECRET.
 * KEY_* must be base64 → exactly 32 bytes (AES-256). INTEGRITY_SECRET is an
 * HMAC pepper — presence only, any non-empty length is valid.
 * No fallbacks — fail closed in every environment.
 */

export const KEYS_REQUIRING_32_BYTES = [
  'KEY_HEALTH',
  'KEY_FINANCE',
  'KEY_MESSAGES',
  'KEY_GENERAL'
];

export const SECRETS_REQUIRING_PRESENCE_ONLY = ['INTEGRITY_SECRET'];

/**
 * @param {NodeJS.ProcessEnv} [envSource=process.env]
 * @throws {Error} when any required secret fails its checks
 */
export function validateRequiredSecrets(envSource = process.env) {
  const errors = [];

  for (const name of KEYS_REQUIRING_32_BYTES) {
    const raw = envSource[name];
    if (raw == null || String(raw).trim() === '') {
      errors.push(`${name} is not set`);
      continue;
    }

    const decoded = Buffer.from(String(raw).trim(), 'base64');
    if (decoded.length !== 32) {
      errors.push(
        `${name} must be base64-encoded and decode to exactly 32 bytes, got ${decoded.length} bytes`
      );
    }
  }

  for (const name of SECRETS_REQUIRING_PRESENCE_ONLY) {
    const raw = envSource[name];
    if (raw == null || String(raw).trim() === '') {
      errors.push(`${name} is not set`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}
