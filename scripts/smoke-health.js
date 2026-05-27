/**
 * Smoke test: env load + HTTP /health (no database required).
 * Usage: node scripts/smoke-health.js
 */
import { createApp } from '../src/createApp.js';
import { createServer } from 'node:http';

const app = createApp();
const server = createServer(app);

await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});

const { port } = server.address();
const response = await fetch(`http://127.0.0.1:${port}/health`);
const body = await response.json();

server.close();

if (response.status !== 200 || body.status !== 'ok') {
  console.error('FAIL: /health', response.status, body);
  process.exit(1);
}

console.log('OK: /health returned { status: "ok" }');
