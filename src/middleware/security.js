const HSTS_VALUE = 'max-age=31536000; includeSubDomains; preload';

function isSecureRequest(req) {
  if (req.secure) {
    return true;
  }
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() === 'https';
  }
  return false;
}

function forceHttpsEnabled() {
  return (
    process.env.FORCE_HTTPS === 'true' || process.env.NODE_ENV === 'production'
  );
}

export function enforceHttps(req, res, next) {
  if (!forceHttpsEnabled() || isSecureRequest(req)) {
    return next();
  }

  if (req.path.startsWith('/api')) {
    return next();
  }

  const host = req.headers.host || 'localhost';
  const target = `https://${host}${req.originalUrl || req.url}`;
  return res.redirect(301, target);
}

export function rejectInsecureApi(req, res, next) {
  if (!forceHttpsEnabled() || !req.path.startsWith('/api')) {
    return next();
  }

  if (isSecureRequest(req)) {
    return next();
  }

  return res.status(403).json({ error: 'https_required' });
}

export function applySecurityHeaders(_req, res, next) {
  res.setHeader('Strict-Transport-Security', HSTS_VALUE);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  return next();
}
