/**
 * Deterministic 32-byte test keys (base64). Used by test preload — not for production.
 */
export const TEST_ENCRYPTION_KEYS = {
  KEY_HEALTH: Buffer.alloc(32, 1).toString('base64'),
  KEY_FINANCE: Buffer.alloc(32, 2).toString('base64'),
  KEY_MESSAGES: Buffer.alloc(32, 3).toString('base64'),
  KEY_GENERAL: Buffer.alloc(32, 4).toString('base64')
};

export function ensureTestEncryptionKeys() {
  for (const [name, value] of Object.entries(TEST_ENCRYPTION_KEYS)) {
    if (!process.env[name]?.trim()) {
      process.env[name] = value;
    }
  }
}
