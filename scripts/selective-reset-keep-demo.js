#!/usr/bin/env node
/**
 * Selektywny reset: zostaw rodzinę demo Kowalskich, usuń resztę workspace'ów.
 *
 * Użycie:
 *   node scripts/selective-reset-keep-demo.js              # tylko podgląd
 *   node scripts/selective-reset-keep-demo.js --confirm    # wykonaj usuwanie
 *
 * Wymaga DATABASE_URL (connection string z Railway → PostgreSQL → Variables).
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DEMO_EMAILS = [
  'anna@coparentes.app',
  'marek@coparentes.app',
  'maria@coparentes.app'
];

const confirm = process.argv.includes('--confirm');
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error('Brak DATABASE_URL. Ustaw w .env albo w terminalu przed uruchomieniem.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : undefined
});

async function listUsers() {
  const { rows } = await client.query(`
    SELECT u.email, u.role, w.name AS workspace, w."inviteCode"
    FROM "User" u
    LEFT JOIN "Workspace" w ON w.id = u."workspaceId"
    ORDER BY u.email
  `);
  return rows;
}

async function previewDelete() {
  const { rows } = await client.query(
    `
    WITH demo AS (
      SELECT DISTINCT u."workspaceId" AS id
      FROM "User" u
      WHERE u.email = ANY($1::text[])
        AND u."workspaceId" IS NOT NULL
    )
    SELECT
      w.name,
      w."inviteCode",
      CASE
        WHEN w.id IN (SELECT id FROM demo) THEN 'ZOSTAJE'
        ELSE 'DO USUNIĘCIA'
      END AS status
    FROM "Workspace" w
    ORDER BY status, w.name
    `,
    [DEMO_EMAILS]
  );
  return rows;
}

async function runDelete() {
  const workspaces = await client.query(
    `
    WITH demo AS (
      SELECT DISTINCT u."workspaceId" AS id
      FROM "User" u
      WHERE u.email = ANY($1::text[])
        AND u."workspaceId" IS NOT NULL
    )
    DELETE FROM "Workspace" w
    WHERE EXISTS (SELECT 1 FROM demo)
      AND w.id NOT IN (SELECT id FROM demo)
    `,
    [DEMO_EMAILS]
  );

  const orphans = await client.query(
    `
    DELETE FROM "User"
    WHERE NOT (email = ANY($1::text[]))
    `,
    [DEMO_EMAILS]
  );

  return {
    workspaces: workspaces.rowCount,
    users: orphans.rowCount
  };
}

try {
  await client.connect();
  console.log('Połączono z bazą.\n');

  console.log('=== Użytkownicy PRZED ===');
  const usersBefore = await listUsers();
  if (usersBefore.length === 0) {
    console.log('(pusto — brak użytkowników)');
  } else {
    for (const row of usersBefore) {
      console.log(`  ${row.email} (${row.role}) — ${row.workspace ?? 'brak rodziny'}`);
    }
  }

  console.log('\n=== Rodziny: co zostaje / co znika ===');
  const preview = await previewDelete();
  if (preview.length === 0) {
    console.log('Brak żadnych rodzin w bazie.');
    process.exit(0);
  }

  const demoExists = preview.some((row) => row.status === 'ZOSTAJE');
  if (!demoExists) {
    console.log('\nUWAGA: Nie ma rodziny demo Kowalskich (anna/marek/maria@coparentes.app).');
    console.log('Najpierw uruchom:');
    console.log('  DATABASE_URL="..." node scripts/ensure-demo-kowalscy.js');
    process.exit(1);
  }

  const orphanCount = usersBefore.filter(
    (row) => !DEMO_EMAILS.includes(row.email)
  ).length;
  if (orphanCount > 0) {
    console.log(`\nKonta do usunięcia (w tym ${orphanCount} bez rodziny): tak`);
  }

  for (const row of preview) {
    console.log(`  [${row.status}] ${row.name} (${row.inviteCode})`);
  }

  if (!confirm) {
    console.log('\nTo tylko podgląd. Aby usunąć, uruchom ponownie z --confirm');
    process.exit(0);
  }

  console.log('\nUsuwam rodziny poza demo i konta bez demo...');
  const deleted = await runDelete();
  console.log(`Usunięto workspace'ów: ${deleted.workspaces}`);
  console.log(`Usunięto kont: ${deleted.users}`);

  console.log('\n=== Użytkownicy PO ===');
  const usersAfter = await listUsers();
  for (const row of usersAfter) {
    console.log(`  ${row.email} (${row.role}) — ${row.workspace ?? 'brak rodziny'}`);
  }

  console.log('\nGotowe. Zaloguj się: anna@coparentes.app / Coparentes!123');
} catch (error) {
  console.error('Błąd:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
