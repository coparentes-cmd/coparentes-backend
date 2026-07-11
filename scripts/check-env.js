/**
 * Validates required environment variables before starting the API.
 * Usage: node scripts/check-env.js
 */
import dotenv from 'dotenv';

dotenv.config();

const required = ['DATABASE_URL', 'FRONTEND_URL'];
const recommended = [
  'CORS_ORIGINS',
  'PUBLIC_BASE_URL',
  'PORT',
  'NODE_ENV',
  'SESSION_TTL_DAYS',
  'SEED_DEMO_DATA',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'INVITE_EXPIRES_DAYS'
];

const ENCRYPTION_KEY_NAMES = ['KEY_HEALTH', 'KEY_FINANCE', 'KEY_MESSAGES', 'KEY_GENERAL'];

let failed = false;

for (const key of required) {
  if (!process.env[key]?.trim()) {
    console.error(`MISSING (required): ${key}`);
    failed = true;
  } else {
    console.log(`OK (required): ${key}`);
  }
}

for (const key of recommended) {
  if (!process.env[key]?.trim()) {
    console.warn(`WARN (optional): ${key} is not set`);
  } else {
    console.log(`OK (optional): ${key}`);
  }
}

if (process.env.NODE_ENV === 'production') {
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (frontendUrl && !corsOrigins.includes(frontendUrl)) {
    console.warn(
      `WARN (production): CORS_ORIGINS does not include FRONTEND_URL (${frontendUrl}). ` +
        'Runtime still allows FRONTEND_URL, but set both on Railway for clarity.'
    );
  }

  if (!process.env.PUBLIC_BASE_URL?.trim()) {
    console.warn(
      'WARN (production): PUBLIC_BASE_URL is not set — export download URLs may be relative.'
    );
  }

  if (process.env.ALLOW_SEED === 'true') {
    console.error('FAIL (production): ALLOW_SEED must not be true');
    failed = true;
  }

  if (process.env.SEED_DEMO_DATA === 'true') {
    console.error('FAIL (production): SEED_DEMO_DATA must not be true');
    failed = true;
  }

  if (!process.env.INTEGRITY_SECRET?.trim()) {
    console.error('FAIL (production): INTEGRITY_SECRET is required');
    failed = true;
  }

  for (const keyName of ENCRYPTION_KEY_NAMES) {
    const envKey = keyName;
    if (!process.env[envKey]?.trim()) {
      console.error(`FAIL (production): ${envKey} is required`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\nCopy .env.example to .env and fill in required values.');
  process.exit(1);
}

console.log('\nEnvironment check passed.');
