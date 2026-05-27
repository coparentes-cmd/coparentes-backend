import { prisma } from '../lib/prisma.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      return res.status(401).json({ error: 'missing_token' });
    }

    const session = await prisma.session.findUnique({
      where: { token }
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { token } });
      }
      return res.status(401).json({ error: 'invalid_session' });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId }
    });

    if (!user?.workspaceId) {
      return res.status(401).json({ error: 'invalid_session' });
    }

    req.user = user;
    req.sessionToken = token;
    return next();
  } catch (error) {
    return next(error);
  }
}
