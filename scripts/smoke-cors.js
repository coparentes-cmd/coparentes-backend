/**
 * Smoke test: CORS preflight for Netlify + coparentes.ai origins.
 * Usage: node scripts/smoke-cors.js [baseUrl]
 */
import { createApp } from '../src/createApp.js';
import { createServer } from 'node:http';

process.env.FRONTEND_URL ??= 'https://coparentes-demo.netlify.app';
process.env.CORS_ORIGINS ??=
  'https://coparentes-demo.netlify.app,https://coparentes.ai';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.NODE_ENV ??= 'test';

const app = createApp();
const server = createServer(app);

await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});

const { port } = server.address();
const baseUrl = process.argv[2] || `http://127.0.0.1:${port}`;

async function preflight(origin) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type'
    }
  });

  return {
    origin,
    status: response.status,
    allowOrigin: response.headers.get('access-control-allow-origin')
  };
}

const cases = [
  ['https://coparentes-demo.netlify.app', 204],
  ['https://preview--coparentes-demo.netlify.app', 204],
  ['https://app.coparentes.ai', 204],
  ['https://evil.example.com', 403]
];

let failed = false;

for (const [origin, expectedStatus] of cases) {
  const result = await preflight(origin);
  const ok =
    result.status === expectedStatus &&
    (expectedStatus !== 204 || result.allowOrigin === origin);

  if (ok) {
    console.log(`OK: ${origin} -> ${result.status}`);
  } else {
    console.error(
      `FAIL: ${origin} -> ${result.status} (expected ${expectedStatus}), allow-origin=${result.allowOrigin}`
    );
    failed = true;
  }
}

server.close();

if (failed) {
  process.exit(1);
}

console.log('CORS smoke test passed.');
