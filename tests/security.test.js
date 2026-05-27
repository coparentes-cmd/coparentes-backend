/**
 * Security regression tests (no DB required for auth guards).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';

const { createApp } = await import('../src/createApp.js');
const { listen, request } = await import('./helpers/http.js');

describe('Security guards (no DB)', () => {
  /** @type {import('node:http').Server} */
  let server;

  before(async () => {
    server = await listen(createApp());
  });

  after(() => {
    server?.close();
  });

  it('POST /api/auth/register — invalid body returns 400', async () => {
    const res = await request(server, 'POST', '/api/auth/register', {
      body: { email: 'bad' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'invalid_request');
  });

  it('POST /api/calendar/swaps/x/respond — requires Bearer', async () => {
    const res = await request(server, 'POST', '/api/calendar/swaps/swap_x/respond', {
      body: { status: 'accepted' }
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/finances/expenses — requires Bearer', async () => {
    const res = await request(server, 'POST', '/api/finances/expenses', {
      body: {
        title: 'Test',
        amount: 10,
        category: 'Other',
        paidBy: 'user_x',
        splitRatio: 0.5,
        date: new Date().toISOString()
      }
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/invite/accept — requires Bearer', async () => {
    const res = await request(server, 'POST', '/api/invite/accept', {
      body: { token: 'fake-token' }
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/auth/login — invalid email returns 400', async () => {
    const res = await request(server, 'POST', '/api/auth/login', {
      body: { email: 'not-an-email', password: 'Password1234!' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'invalid_request');
  });
});
