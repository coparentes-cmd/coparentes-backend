import { getAccountStats } from './accountStats.js';
import { sendWeeklyStatsEmail } from '../utils/mailer.js';

const CHECK_INTERVAL_MS = 60 * 1000;

/** @type {string | null} YYYY-MM-DD in Europe/Warsaw — last successful send (in-process). */
let lastSentDayKey = null;

/** @type {ReturnType<typeof setInterval> | null} */
let intervalHandle = null;

function weeklyStatsEnabled() {
  return process.env.WEEKLY_STATS_ENABLED === 'true';
}

function statsEmailTo() {
  const configured = String(process.env.STATS_EMAIL_TO || '').trim();
  return configured || 'coparentes@gmail.com';
}

/** Local calendar parts in Europe/Warsaw (no extra deps). */
export function getWarsawParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') {
      parts[p.type] = p.value;
    }
  }
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

/**
 * Shared job for HTTP cron + in-process scheduler.
 * Dedupes successful sends per Europe/Warsaw calendar day (unless force).
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ ok: true, emailedTo: string, messageId: string | null, stats: object | null, skipped?: boolean } | { ok: false, error: string, status: number, stats?: object }>}
 */
export async function runWeeklyStatsJob({ force = false } = {}) {
  if (!weeklyStatsEnabled()) {
    return { ok: false, error: 'weekly_stats_disabled', status: 503 };
  }

  const dayKey = getWarsawParts().dayKey;
  if (!force && lastSentDayKey === dayKey) {
    return {
      ok: true,
      skipped: true,
      emailedTo: statsEmailTo(),
      messageId: null,
      stats: null
    };
  }

  try {
    const stats = await getAccountStats();
    const to = statsEmailTo();
    const mail = await sendWeeklyStatsEmail({ to, stats });

    if (!mail?.emailSent) {
      return { ok: false, error: 'email_send_failed', status: 502, stats };
    }

    lastSentDayKey = dayKey;

    return {
      ok: true,
      emailedTo: to,
      messageId: mail.id || null,
      stats
    };
  } catch (error) {
    console.error('[weekly-stats] job failed:', error?.message || error);
    return { ok: false, error: 'weekly_stats_failed', status: 500 };
  }
}

/** Test helper — reset in-process dedupe. */
export function resetWeeklyStatsSchedulerForTests() {
  lastSentDayKey = null;
}

function shouldFireNow(parts = getWarsawParts()) {
  // Match cron-job.org "Ilość kont": daily 20:00 Europe/Warsaw.
  return parts.hour === 20 && parts.minute === 0;
}

async function tick() {
  if (!weeklyStatsEnabled()) {
    return;
  }
  const parts = getWarsawParts();
  if (!shouldFireNow(parts)) {
    return;
  }
  if (lastSentDayKey === parts.dayKey) {
    return;
  }
  console.log('[weekly-stats] in-process schedule fired (Europe/Warsaw 20:00)');
  const result = await runWeeklyStatsJob();
  if (!result.ok) {
    console.error('[weekly-stats] in-process run failed:', result.error);
  } else {
    console.log(
      `[weekly-stats] emailed ${result.emailedTo} usersActive=${result.stats?.usersActive}`
    );
  }
}

/**
 * Starts a 1-minute poller. No-op when WEEKLY_STATS_ENABLED is not true.
 * Safe to call once at process start; does not change HTTP API behaviour.
 */
export function startWeeklyStatsScheduler() {
  if (!weeklyStatsEnabled()) {
    console.log('[weekly-stats] scheduler off (WEEKLY_STATS_ENABLED!=true)');
    return;
  }
  if (intervalHandle) {
    return;
  }
  console.log(
    '[weekly-stats] scheduler on — daily 20:00 Europe/Warsaw (deduped per day)'
  );
  intervalHandle = setInterval(() => {
    tick().catch((error) => {
      console.error('[weekly-stats] tick failed', error);
    });
  }, CHECK_INTERVAL_MS);
  // Do not keep the event loop alive solely for this timer on shutdown paths.
  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}
