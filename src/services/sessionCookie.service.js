import { env } from '../utils/env.js';

export const SESSION_COOKIE = 'coparentes_session';

export function sessionCookieOptions() {
  const secure = env.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/api',
    maxAge: env.sessionTtlDays * 24 * 60 * 60 * 1000
  };
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return {};
  }

  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export function readSessionToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) {
      return bearer;
    }
  }

  const cookies = parseCookies(req);
  const cookieToken = cookies[SESSION_COOKIE];
  return typeof cookieToken === 'string' && cookieToken.trim()
    ? cookieToken.trim()
    : null;
}
