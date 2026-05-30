#!/usr/bin/env node
/**
 * Tworzy rodzinę demo Kowalskich na produkcji (nawet gdy są inne konta).
 *
 * Użycie:
 *   DATABASE_URL="..." node scripts/ensure-demo-kowalscy.js
 */
import dotenv from 'dotenv';

dotenv.config();

process.env.ALLOW_SEED = 'true';

if (!process.env.DATABASE_URL?.trim()) {
  console.error('Brak DATABASE_URL.');
  process.exit(1);
}

const { seedDemoData } = await import('../src/lib/seed.js');

await seedDemoData({ force: true });
console.log('Gotowe. Demo: anna@coparentes.app / Coparentes!123 (kod: KOWALSCY2026)');
