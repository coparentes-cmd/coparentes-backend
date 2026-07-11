import { env } from '../utils/env.js';

function parseList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePatterns(value) {
  return parseList(value).map((pattern) => {
    try {
      return new RegExp(pattern, 'i');
    } catch {
      console.warn(`Ignoring invalid CORS_ORIGIN_PATTERNS entry: ${pattern}`);
      return null;
    }
  }).filter(Boolean);
}

function isLocalDevOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const exactOrigins = new Set([
  ...parseList(process.env.CORS_ORIGINS),
  env.frontendUrl
].filter(Boolean));

const originPatterns = [
  ...parsePatterns(process.env.CORS_ORIGIN_PATTERNS),
  // Netlify preview + production deploys
  /^https:\/\/[a-z0-9-]+(?:--[a-z0-9-]+)?\.netlify\.app$/i,
  // Coparentes marketing / app domains
  /^https:\/\/(?:[a-z0-9-]+\.)*coparentes\.ai$/i,
  // Custom domains registered via Netlify (e.g. getcoparentes.app)
  /^https:\/\/(?:[a-z0-9-]+\.)*coparentes\.app$/i
];

export function getCorsConfigSummary() {
  return {
    exactOrigins: [...exactOrigins],
    originPatterns: originPatterns.map((pattern) => pattern.source),
    allowLocalDevOrigins: env.nodeEnv !== 'production'
  };
}

export function isOriginAllowed(origin) {
  // No Origin header: same-origin navigation, server-to-server, curl, or some mobile clients.
  // We allow these through; credentialed cross-origin requests always send Origin.
  if (!origin) {
    return true;
  }

  if (exactOrigins.has(origin)) {
    return true;
  }

  if (env.nodeEnv !== 'production' && isLocalDevOrigin(origin)) {
    return true;
  }

  return originPatterns.some((pattern) => pattern.test(origin));
}

export function createCorsMiddleware() {
  return (req, res, next) => {
    const origin = req.headers.origin;

    if (isOriginAllowed(origin)) {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Accept, Origin, X-Trusted-Device-Token'
      );
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      if (!origin || isOriginAllowed(origin)) {
        return res.sendStatus(204);
      }
      return res.status(403).json({ error: 'cors_not_allowed' });
    }

    if (origin && !isOriginAllowed(origin)) {
      return res.status(403).json({ error: 'cors_not_allowed' });
    }

    return next();
  };
}
