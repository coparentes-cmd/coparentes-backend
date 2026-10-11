/**
 * Weekly account-stats cron + mail (ops digest).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.MAILER_STUB_SUCCESS = 'true';
process.env.WEEKLY_STATS_ENABLED = 'true';
process.env.CRON_SECRET = 'test-cron-secret-weekly-stats';
process.env.STATS_EMAIL_TO = 'coparentes@gmail.com';

import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';
import {
  getStubLastWeeklyStatsPayload,
  getStubLastWeeklyStatsRecipients,
  sendWeeklyStatsEmail
} from '../src/utils/mailer.js';

describe('sendWeeklyStatsEmail (stub)', () => {
  it('sends to configured recipient with counts only', async () => {
    const stats = {
      generatedAt: '2026-10-11T10:00:00.000Z',
      usersActive: 12,
      usersDeleted: 1,
      parentsActive: 8,
      usersByRole: { parentA: 5, parentB: 3, child: 4, observer: 0 },
      workspacesTotal: 5,
      usersCreatedLast7Days: 2,
      usersCreatedLast30Days: 6
    };

    const result = await sendWeeklyStatsEmail({
      to: 'coparentes@gmail.com',
      stats
    });

    assert.equal(result.emailSent, true);
    assert.deepEqual(getStubLastWeeklyStatsRecipients(), [
      'coparentes@gmail.com'
    ]);
    assert.equal(getStubLastWeeklyStatsPayload()?.usersActive, 12);
    assert.equal(getStubLastWeeklyStatsPayload()?.workspacesTotal, 5);
  });
});

describe(
  'POST /api/internal/cron/weekly-stats',
  { skip: !(await dbReady()) },
  () => {
    /** @type {import('node:http').Server} */
    let server;

    before(async () => {
      server = await listen(createApp());
    });

    after(() => {
      server?.close();
    });

    it('rejects missing secret', async () => {
      const res = await request(
        server,
        'POST',
        '/api/internal/cron/weekly-stats'
      );
      assert.equal(res.status, 401);
      assert.equal(res.json?.error, 'unauthorized');
    });

    it('rejects wrong secret', async () => {
      const res = await request(
        server,
        'POST',
        '/api/internal/cron/weekly-stats',
        { token: 'wrong-secret' }
      );
      assert.equal(res.status, 401);
    });

    it('sends digest with valid Bearer secret', async () => {
      const res = await request(
        server,
        'POST',
        '/api/internal/cron/weekly-stats',
        { token: 'test-cron-secret-weekly-stats' }
      );
      assert.equal(res.status, 200);
      assert.equal(res.json?.ok, true);
      assert.equal(res.json?.emailedTo, 'coparentes@gmail.com');
      assert.equal(typeof res.json?.stats?.usersActive, 'number');
      assert.equal(typeof res.json?.stats?.workspacesTotal, 'number');
      assert.ok(res.json?.stats?.usersByRole);
      assert.deepEqual(getStubLastWeeklyStatsRecipients(), [
        'coparentes@gmail.com'
      ]);
    });

    it('accepts X-Cron-Secret header', async () => {
      const res = await request(
        server,
        'POST',
        '/api/internal/cron/weekly-stats',
        {
          headers: {
            'X-Cron-Secret': 'test-cron-secret-weekly-stats'
          }
        }
      );
      assert.equal(res.status, 200);
      assert.equal(res.json?.ok, true);
    });
  }
);

describe('POST /api/internal/cron/weekly-stats when disabled', () => {
  /** @type {import('node:http').Server} */
  let server;
  let previousEnabled;

  before(async () => {
    previousEnabled = process.env.WEEKLY_STATS_ENABLED;
    process.env.WEEKLY_STATS_ENABLED = 'false';
    server = await listen(createApp());
  });

  after(() => {
    server?.close();
    process.env.WEEKLY_STATS_ENABLED = previousEnabled;
  });

  it('returns 503', async () => {
    const res = await request(
      server,
      'POST',
      '/api/internal/cron/weekly-stats',
      { token: 'test-cron-secret-weekly-stats' }
    );
    assert.equal(res.status, 503);
    assert.equal(res.json?.error, 'weekly_stats_disabled');
  });
});
