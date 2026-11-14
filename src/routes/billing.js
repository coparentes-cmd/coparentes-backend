import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getEntitlementForUser,
  startMobileTrial,
  billingPublicFields,
  hasMobileAppAccess,
  normalizeClientPlatform
} from '../services/entitlement.service.js';
import { serializeUser } from '../services/serializers.js';

const router = Router();

function clientPlatform(req) {
  return (
    req.headers['x-client-platform'] ||
    req.query.platform ||
    req.body?.platform ||
    'web'
  );
}

/**
 * GET /api/billing/entitlement
 * Header X-Client-Platform: web | ios | android
 * Web always accessAllowed=true for parents; mobile follows trial/active.
 */
router.get('/entitlement', requireAuth, async (req, res, next) => {
  try {
    const result = await getEntitlementForUser(req.user.id, clientPlatform(req));
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(200).json({
      platform: result.platform,
      accessAllowed: result.accessAllowed,
      ...billingPublicFields(result.user)
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/billing/start-mobile-trial
 * Starts a one-time 30-day trial for a parent. Idempotent if already trialing/active.
 * Web clients may call it (no harm); Flutter should call only on mobile.
 */
router.post('/start-mobile-trial', requireAuth, async (req, res, next) => {
  try {
    const platform = normalizeClientPlatform(clientPlatform(req));
    const result = await startMobileTrial(req.user.id);
    if (result.error) {
      return res.status(result.status).json({
        error: result.error,
        ...(result.user ? billingPublicFields(result.user) : {})
      });
    }
    return res.status(200).json({
      started: result.started,
      platform,
      accessAllowed: hasMobileAppAccess(result.user, platform),
      user: {
        ...serializeUser(result.user),
        ...billingPublicFields(result.user)
      },
      ...billingPublicFields(result.user)
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
