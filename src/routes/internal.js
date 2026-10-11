import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getAccountStats } from '../services/accountStats.js';
import { sendWeeklyStatsEmail } from '../utils/mailer.js';

const router = Router();

function weeklyStatsEnabled() {
  return process.env.WEEKLY_STATS_ENABLED === 'true';
}

function cronSecret() {
  return String(process.env.CRON_SECRET || '').trim();
}

function statsEmailTo() {
  const configured = String(process.env.STATS_EMAIL_TO || '').trim();
  return configured || 'coparentes@gmail.com';
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

  try {
    const stats = await getAccountStats();
    const to = statsEmailTo();
    const mail = await sendWeeklyStatsEmail({ to, stats });

    if (!mail?.emailSent) {
      return res.status(502).json({
        error: 'email_send_failed',
        stats
      });
    }

    return res.status(200).json({
      ok: true,
      emailedTo: to,
      messageId: mail.id || null,
      stats
    });
  } catch (error) {
    console.error('[internal] weekly-stats failed:', error?.message || error);
    return res.status(500).json({ error: 'weekly_stats_failed' });
  }
});

export default router;
