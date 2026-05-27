/**
 * Probe API reachability (status codes only).
 * Usage: node scripts/probe-endpoints.js [baseUrlWithoutApi]
 */
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');

const routes = [
  { method: 'GET', path: '/health', outsideApi: true },
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/ready' },
  {
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'probe@test.coparentes.app', password: 'invalid-password-12345' }
  },
  { method: 'GET', path: '/api/auth/session', auth: true },
  { method: 'GET', path: '/api/threads', auth: true },
  { method: 'GET', path: '/api/exports', auth: true },
  { method: 'GET', path: '/api/workspace/current', auth: true },
  { method: 'GET', path: '/api/calendar', auth: true },
  { method: 'GET', path: '/api/finances/expenses', auth: true },
  { method: 'POST', path: '/api/invite/send', auth: true, body: { email: 'probe@test.coparentes.app' } }
];

async function request(route) {
  const url = route.outsideApi
    ? `${base}${route.path.replace('/api', '')}`
    : `${base}${route.path}`;

  try {
    const response = await fetch(url, {
      method: route.method,
      headers: {
        'Content-Type': 'application/json',
        ...(route.auth ? { Authorization: 'Bearer invalid-token' } : {})
      },
      body: route.body ? JSON.stringify(route.body) : undefined,
      signal: AbortSignal.timeout(5000)
    });
    return response.status;
  } catch (error) {
    return `ERR:${error.message}`;
  }
}

console.log(`Probing ${base}\n`);

for (const route of routes) {
  const status = await request(route);
  console.log(`${route.method.padEnd(4)} ${route.path.padEnd(32)} → ${status}`);
}

console.log('\nLegend: 200/204=OK, 401=mounted (auth required), 404=not mounted, 400/403=mounted');
