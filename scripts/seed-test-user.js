/**
 * Idempotent test-user seed for Railway post-migrate.
 * Always ensures test@coparentes.app exists with the configured password.
 * Usage: node scripts/seed-test-user.js
 */
import dotenv from 'dotenv';
import { ensureTestUser } from '../src/lib/seed.js';
import { prisma } from '../src/lib/prisma.js';

dotenv.config();

async function main() {
  if (process.env.ALLOW_SEED !== 'true') {
    console.log('[seed-test-user] ALLOW_SEED is not true — skipping.');
    return;
  }

  if (process.env.SEED_TEST_USER === 'false') {
    console.log('[seed-test-user] SEED_TEST_USER=false — skipping.');
    return;
  }

  if (!process.env.SEED_TEST_PASSWORD?.trim()) {
    console.error(
      '[seed-test-user] SEED_TEST_PASSWORD is required when ALLOW_SEED=true.'
    );
    process.exit(1);
  }

  const email = process.env.SEED_TEST_EMAIL ?? 'test@coparentes.app';
  console.warn('[seed-test-user] WARNING: Seeding test credentials into the database.');
  console.log(`[seed-test-user] ensuring test account ${email} ...`);

  const result = await ensureTestUser();
  const userCount = await prisma.user.count();

  console.log(
    `[seed-test-user] done (${result.action}) — total users in database: ${userCount}`
  );
}

main()
  .catch((error) => {
    console.error('[seed-test-user] failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
