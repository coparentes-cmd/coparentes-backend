import { prisma } from '../lib/prisma.js';
import { readSessionToken } from '../services/sessionCookie.service.js';
import {
  deleteSession,
  findSessionByToken
} from '../services/session.js';

export async function requireAuth(req, res, next) {
  try {
    const token = readSessionToken(req);

    if (!token) {
      return res.status(401).json({ error: 'missing_token' });
    }

    const session = await findSessionByToken(token);

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await deleteSession(token);
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
    req.workspaceId = user.workspaceId;
    req.familyId = user.workspaceId;
    return next();
  } catch (error) {
    return next(error);
  }
}
