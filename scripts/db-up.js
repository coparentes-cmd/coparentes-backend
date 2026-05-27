#!/usr/bin/env node
/**
 * Start local PostgreSQL for development.
 * 1. docker compose up -d postgres (preferred)
 * 2. embedded-postgres fallback when Docker is unavailable
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const stateFile = path.join(rootDir, '.pg-embedded.json');
const databaseDir = path.join(rootDir, '.pgdata');

function runDockerCompose() {
  const dockerCandidates = [
    'docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker'
  ];

  for (const docker of dockerCandidates) {
    const version = spawnSync(docker, ['compose', 'version'], {
      stdio: 'ignore'
    });
    if (version.status !== 0) {
      continue;
    }

    const up = spawnSync(docker, ['compose', 'up', '-d', 'postgres'], {
      cwd: rootDir,
      stdio: 'inherit'
    });
    return up.status === 0;
  }

  return false;
}

async function ensureDatabase(client) {
  const result = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    ['coparentes']
  );

  if (result.rowCount === 0) {
    await client.query('CREATE DATABASE coparentes');
    console.log('Created database: coparentes');
  }
}

async function runEmbeddedPostgres() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pg = await import('pg');

  let state = { initialised: false };
  if (existsSync(stateFile)) {
    state = JSON.parse(readFileSync(stateFile, 'utf8'));
  }

  mkdirSync(databaseDir, { recursive: true });

  const embedded = new EmbeddedPostgres({
    databaseDir,
    user: 'user',
    password: 'password',
    port: 5432,
    persistent: true,
    initdbFlags: ['-c', 'dynamic_shared_memory_type=mmap']
  });

  if (!state.initialised) {
    await embedded.initialise();
    writeFileSync(stateFile, JSON.stringify({ initialised: true }, null, 2));
  }

  await embedded.start();

  const client = new pg.default.Client({
    host: 'localhost',
    port: 5432,
    user: 'user',
    password: 'password',
    database: 'postgres'
  });
  await client.connect();
  await ensureDatabase(client);
  await client.end();

  console.log('Embedded PostgreSQL running on localhost:5432');
  console.log('DATABASE_URL=postgresql://user:password@localhost:5432/coparentes');
  console.log('Data directory:', databaseDir);
  console.log('Press Ctrl+C to stop embedded PostgreSQL.');
}

try {
  console.log('Trying Docker Compose...');
  if (runDockerCompose()) {
    console.log('PostgreSQL started via Docker Compose.');
    process.exit(0);
  }

  console.log('Docker unavailable — starting embedded PostgreSQL...');
  await runEmbeddedPostgres();

  setInterval(() => {}, 60_000);
} catch (error) {
  console.error('Failed to start PostgreSQL:', error.message);
  process.exit(1);
}
