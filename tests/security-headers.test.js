/**
 * Security headers and HTTPS enforcement.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.FORCE_HTTPS = 'false';

const { createApp } = await import('../src/createApp.js');
const { listen, request } = await import('./helpers/http.js');

describe('Security headers middleware', () => {
  /** @type {import('node:http').Server} */
  let server;

  before(async () => {
    server = await listen(createApp());
  });

  after(() => {
    server?.close();
  });

  it('sets security headers on health endpoint', async () => {
    const res = await request(server, 'GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['x-xss-protection'], '1; mode=block');
    assert.match(
      String(res.headers['content-security-policy'] ?? ''),
      /default-src 'self'/
    );
    assert.match(
      String(res.headers['strict-transport-security'] ?? ''),
      /max-age=31536000/
    );
  });
});

describe('HTTPS enforcement in production mode', () => {
  it('allows internal health probe over HTTP when FORCE_HTTPS is enabled', async () => {
    const previousForce = process.env.FORCE_HTTPS;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.FORCE_HTTPS = 'true';
    process.env.NODE_ENV = 'production';

    const { createApp: createProdApp } = await import(
      `../src/createApp.js?health=${Date.now()}`
    );
    const prodApp = createProdApp();
    const prodServer = await listen(prodApp);
    try {
      const res = await request(prodServer, 'GET', '/health');
      assert.equal(res.status, 200);
    } finally {
      prodServer.close();
      process.env.FORCE_HTTPS = previousForce;
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('rejects insecure API requests when FORCE_HTTPS is enabled', async () => {
    const previousForce = process.env.FORCE_HTTPS;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.FORCE_HTTPS = 'true';
    process.env.NODE_ENV = 'production';

    const { createApp: createProdApp } = await import(
      `../src/createApp.js?ts=${Date.now()}`
    );
    const prodApp = createProdApp();
    const prodServer = await listen(prodApp);
    try {
      const res = await request(prodServer, 'GET', '/api/health');
      assert.equal(res.status, 403);
      assert.equal(res.json.error, 'https_required');
    } finally {
      prodServer.close();
      process.env.FORCE_HTTPS = previousForce;
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
