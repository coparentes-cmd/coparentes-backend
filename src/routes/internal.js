import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
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

export default router;
