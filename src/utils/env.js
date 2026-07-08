import dotenv from 'dotenv';

dotenv.config();

const required = ['DATABASE_URL', 'FRONTEND_URL'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function parseCorsOrigins() {
  const configured = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '';
  const origins = configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (process.env.FRONTEND_URL && !origins.includes(process.env.FRONTEND_URL)) {
    origins.push(process.env.FRONTEND_URL.trim());
  }

  return origins;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: process.env.FRONTEND_URL,
  corsOrigins: parseCorsOrigins(),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  allowSeed: process.env.ALLOW_SEED === 'true',
  seedDemoData: process.env.SEED_DEMO_DATA === 'true',
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || '',
  inviteExpiresDays: Number(process.env.INVITE_EXPIRES_DAYS || 7),
  parentInviteTtlHours: Number(process.env.PARENT_INVITE_TTL_HOURS || 24),
  integritySecret: process.env.INTEGRITY_SECRET || '',
  jwtSecret: process.env.JWT_SECRET || '',
  exportTtlDays: Number(process.env.EXPORT_TTL_DAYS || 30),
  forceHttps:
    process.env.FORCE_HTTPS === 'true' || process.env.NODE_ENV === 'production',
  encryptionKeys: {
    KEY_HEALTH: process.env.KEY_HEALTH || '',
    KEY_FINANCE: process.env.KEY_FINANCE || '',
    KEY_MESSAGES: process.env.KEY_MESSAGES || '',
    KEY_GENERAL: process.env.KEY_GENERAL || ''
  },
  otpEnabled: process.env.OTP_ENABLED !== 'false',
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60),
  trustedDeviceTtlDays: Number(process.env.TRUSTED_DEVICE_TTL_DAYS || 30)
};
