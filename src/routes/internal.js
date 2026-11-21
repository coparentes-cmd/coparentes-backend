import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { sendPushToUser } from '../services/push.service.js';
import { runWeeklyStatsJob } from '../services/weeklyStatsJob.js';

const router = Router();

function weeklyStatsEnabled() {
  return process.env.WEEKLY_STATS_ENABLED === 'true';
}

function cronSecret() {
  return String(process.env.CRON_SECRET || '').trim();
}

function extractProvidedSecret(req) {
  const headerSecret = req.headers['x-cron-secret'];
  if (typeof headerSecret === 'string' && headerSecret.trim()) {
    return headerSecret.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function isAuthorizedCron(req) {
  const expected = cronSecret();
  const provided = extractProvidedSecret(req);
  if (!expected || !provided) {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * POST /api/internal/cron/weekly-stats
 *
 * Protected by CRON_SECRET (Bearer or X-Cron-Secret).
 * Sends account counts to STATS_EMAIL_TO (default coparentes@gmail.com).
 */
router.post('/cron/weekly-stats', async (req, res) => {
  if (!weeklyStatsEnabled()) {
    return res.status(503).json({ error: 'weekly_stats_disabled' });
  }

  if (!cronSecret()) {
    console.error('[internal] WEEKLY_STATS_ENABLED but CRON_SECRET is empty');
    return res.status(503).json({ error: 'cron_secret_not_configured' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const result = await runWeeklyStatsJob();
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      ...(result.stats ? { stats: result.stats } : {})
    });
  }

  return res.status(200).json({
    ok: true,
    emailedTo: result.emailedTo,
    messageId: result.messageId,
    stats: result.stats,
    ...(result.skipped ? { skipped: true } : {})
  });
});

/**
 * POST /api/internal/cron/push-d3-trial
 *
 * F2a skeleton for “trial ends in 3 days” push.
 * Full trial selection comes in F3 — here we only stub-send to users that
 * already have a DevicePushToken (dry-run list), protected by CRON_SECRET.
 */
router.post('/cron/push-d3-trial', async (req, res) => {
  if (!cronSecret()) {
    return res.status(503).json({ error: 'cron_secret_not_configured' });
  }
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const rows = await prisma.devicePushToken.findMany({
    distinct: ['userId'],
    select: { userId: true }
  });

  const title = 'Coparentes';
  const body =
    'Okres testowy kończy się za 3 dni. Przedłuż dostęp w aplikacji, żeby nic nie stracić.';

  let attempted = 0;
  for (const row of rows) {
    const result = await sendPushToUser({
      userId: row.userId,
      title,
      body,
      data: { type: 'trial_d3' }
    });
    attempted += result.attempted;
  }

  return res.status(200).json({
    ok: true,
    stubbed: true,
    users: rows.length,
    attempted
  });
});

/**
 * POST /api/internal/push/test-send
 *
 * Smoke helper: send one test notification to a userId that already has tokens.
 * Body: { userId, title?, body? }. Protected by CRON_SECRET.
 */
router.post('/push/test-send', async (req, res) => {
  if (!cronSecret()) {
    return res.status(503).json({ error: 'cron_secret_not_configured' });
  }
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  if (!userId) {
    return res.status(400).json({ error: 'invalid_request', message: 'userId required' });
  }

  const title =
    typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim()
      : 'Coparentes';
  const body =
    typeof req.body?.body === 'string' && req.body.body.trim()
      ? req.body.body.trim()
      : 'Test push F2b';

  const result = await sendPushToUser({
    userId,
    title,
    body,
    data: { type: 'test_send' }
  });

  return res.status(200).json({ ok: true, ...result });
});

export default router;
