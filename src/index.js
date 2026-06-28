import { createApp } from './createApp.js';
import { getCorsConfigSummary } from './middleware/cors.js';
import { env } from './utils/env.js';
import { isEmailDeliveryConfigured } from './utils/mailer.js';
import { seedDemoData } from './lib/seed.js';
import { purgeExpiredSessions } from './services/session.js';
import { purgeExpiredExportJobs } from './services/exports.js';

const PURGE_INTERVAL_MS = 60 * 60 * 1000;

const app = createApp();

function startPurgeInterval() {
  const runPurge = async () => {
    await purgeExpiredSessions();
    await purgeExpiredExportJobs();
  };

  runPurge().catch((error) => {
    console.error('[purge] initial run failed', error);
  });

  setInterval(() => {
    runPurge().catch((error) => {
      console.error('[purge] scheduled run failed', error);
    });
  }, PURGE_INTERVAL_MS);
}

async function start() {
  if (env.seedDemoData) {
    if (!env.allowSeed) {
      console.warn(
        '[startup] SEED_DEMO_DATA=true but ALLOW_SEED is not true — skipping demo seed.'
      );
    } else {
      await seedDemoData();
    }
  }

  startPurgeInterval();

  app.listen(env.port, () => {
    const cors = getCorsConfigSummary();
    console.log(`Coparentes API listening on port ${env.port}`);
    console.log(
      `Email delivery: ${isEmailDeliveryConfigured() ? 'configured' : 'NOT configured (Resend)'}`
    );
    console.log(
      `CORS: ${cors.exactOrigins.length} exact origin(s), ${cors.originPatterns.length} pattern(s), localDev=${cors.allowLocalDevOrigins}`
    );
    if (cors.exactOrigins.length) {
      console.log(`CORS exact origins: ${cors.exactOrigins.join(', ')}`);
    }
  });
}

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
