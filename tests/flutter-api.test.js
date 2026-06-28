/**
 * Contract tests: Stack A routes expected by Coparentes Flutter client.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';

const { createApp } = await import('../src/createApp.js');
const { listen, request } = await import('./helpers/http.js');

describe('Flutter API contract (no DB)', () => {
  /** @type {import('node:http').Server} */
  let server;

  before(async () => {
    server = await listen(createApp());
  });

  after(() => {
    server?.close();
  });

  it('GET /health — AppApiClient.pingHealth', async () => {
    const res = await request(server, 'GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
  });

  it('GET /api/threads — requires Bearer (MessagingRepository)', async () => {
    const res = await request(server, 'GET', '/api/threads');
    assert.equal(res.status, 401);
    assert.equal(res.json.error, 'missing_token');
  });

  it('POST /api/auth/logout — 401 without token (AuthRepository)', async () => {
    const res = await request(server, 'POST', '/api/auth/logout');
    assert.equal(res.status, 401);
  });

  it('POST /api/auth/join — invalid body (AuthRepository.joinWorkspace)', async () => {
    const res = await request(server, 'POST', '/api/auth/join', { body: {} });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'invalid_request');
  });

  it('GET /api/exports — requires Bearer (ExportRepository)', async () => {
    const res = await request(server, 'GET', '/api/exports');
    assert.equal(res.status, 401);
  });

  it('GET /api/exports/:id/download — requires Bearer', async () => {
    const res = await request(server, 'GET', '/api/exports/export_x/download');
    assert.equal(res.status, 401);
  });

  it('GET /api/calendar — requires Bearer (CalendarRepository)', async () => {
    const res = await request(server, 'GET', '/api/calendar');
    assert.equal(res.status, 401);
  });

  it('GET /api/finances/expenses — requires Bearer (FinanceRepository)', async () => {
    const res = await request(server, 'GET', '/api/finances/expenses');
    assert.equal(res.status, 401);
  });

  it('POST /api/workspace/children — requires Bearer (onboarding)', async () => {
    const res = await request(server, 'POST', '/api/workspace/children', {
      body: {
        name: 'Zosia Test',
        dateOfBirth: '2016-05-12T00:00:00.000Z',
        school: 'SP 1'
      }
    });
    assert.equal(res.status, 401);
  });

  it('GET /api/documents — requires Bearer (DocumentsRepository)', async () => {
    const res = await request(server, 'GET', '/api/documents');
    assert.equal(res.status, 401);
  });

  it('PATCH /api/auth/profile — requires Bearer', async () => {
    const res = await request(server, 'PATCH', '/api/auth/profile', {
      body: { name: 'Updated Name' }
    });
    assert.equal(res.status, 401);
  });

  it('GET /api/consents — requires Bearer (ConsentRepository)', async () => {
    const res = await request(server, 'GET', '/api/consents');
    assert.equal(res.status, 401);
  });

  it('POST /api/auth/password — requires Bearer', async () => {
    const res = await request(server, 'POST', '/api/auth/password', {
      body: {
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass123!'
      }
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/invite/send — requires Bearer', async () => {
    const res = await request(server, 'POST', '/api/invite/send', {
      body: { email: 'partner@coparentes.app' }
    });
    assert.equal(res.status, 401);
  });

  it('OPTIONS /api/auth/login — CORS preflight for Netlify origin', async () => {
    const res = await request(server, 'OPTIONS', '/api/auth/login', {
      headers: {
        Origin: 'https://coparentes-demo.netlify.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type'
      }
    });
    assert.equal(res.status, 204);
    assert.equal(
      res.headers['access-control-allow-origin'],
      'https://coparentes-demo.netlify.app'
    );
  });

  it('OPTIONS /api/auth/login — rejects unknown origin', async () => {
    const res = await request(server, 'OPTIONS', '/api/auth/login', {
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'POST'
      }
    });
    assert.equal(res.status, 403);
  });
});
