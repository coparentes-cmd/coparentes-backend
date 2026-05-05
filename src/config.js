const path = require("node:path");

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAllowedOrigins(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const allowedOrigins = parseAllowedOrigins(process.env.COPARENTES_ALLOWED_ORIGINS);

if (isProduction && allowedOrigins.length === 0) {
  throw new Error(
    "COPARENTES_ALLOWED_ORIGINS must be set in production (comma-separated frontend origins).",
  );
}

const config = {
  nodeEnv,
  isProduction,
  host: process.env.HOST ?? "0.0.0.0",
  port: parseInteger(process.env.PORT, 4000),
  trustProxy: parseBoolean(process.env.COPARENTES_TRUST_PROXY, isProduction),
  jsonLimit: process.env.COPARENTES_JSON_LIMIT ?? "1mb",
  sessionTtlDays: parseInteger(process.env.COPARENTES_SESSION_TTL_DAYS, 30),
  allowedOrigins,
  logRequests: parseBoolean(process.env.COPARENTES_LOG_REQUESTS, !isProduction),
  seedDemoData: parseBoolean(process.env.COPARENTES_SEED_DEMO_DATA, !isProduction),
  dbPath:
    process.env.COPARENTES_DB_PATH ??
    path.join(__dirname, "..", "data", "coparentes.db"),
  publicBaseUrl: String(process.env.COPARENTES_PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
};

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  if (config.allowedOrigins.length === 0) {
    return !config.isProduction;
  }

  return config.allowedOrigins.includes(origin);
}

module.exports = {
  config,
  isOriginAllowed,
};
