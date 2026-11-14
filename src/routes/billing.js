import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getEntitlementForUser,
  startMobileTrial,
  billingPublicFields,
  hasMobileAppAccess,
  isMobilePlatform,
  normalizeClientPlatform
} from '../services/entitlement.service.js';
import { serializeUser } from '../services/serializers.js';
import { env } from '../utils/env.js';
import {
  createBillingPortalSession,
  createCheckoutSession,
  isStripeConfigured
} from '../services/stripe.service.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

function clientPlatform(req) {
  return (
    req.headers['x-client-platform'] ||
    req.query.platform ||
    req.body?.platform ||
    'web'
  );
}

function billingReturnUrls() {
  const base = (env.frontendUrl || 'http://localhost:8080').replace(/\/$/, '');
  return {
    successUrl: `${base}/?billing=success`,
    cancelUrl: `${base}/?billing=cancel`,
    portalReturnUrl: `${base}/?billing=portal`
  };
}

function rejectIfWeb(req, res) {
  const platform = normalizeClientPlatform(clientPlatform(req));
  if (!isMobilePlatform(platform)) {
    res.status(403).json({ error: 'stripe_mobile_only' });
    return null;
  }
  return platform;
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

/**
 * POST /api/billing/checkout-session
 * Mobile only. Returns Stripe Checkout URL (Test mode).
 */
router.post('/checkout-session', requireAuth, async (req, res, next) => {
  try {
    const platform = rejectIfWeb(req, res);
    if (!platform) {
      return undefined;
    }
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'stripe_not_configured' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const urls = billingReturnUrls();
    const session = await createCheckoutSession(user, urls);
    return res.status(200).json({
      platform,
      url: session.url,
      sessionId: session.sessionId
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
});

/**
 * POST /api/billing/portal-session
 * Mobile only. Customer portal for existing Stripe customers.
 */
router.post('/portal-session', requireAuth, async (req, res, next) => {
  try {
    const platform = rejectIfWeb(req, res);
    if (!platform) {
      return undefined;
    }
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'stripe_not_configured' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const { portalReturnUrl } = billingReturnUrls();
    const portal = await createBillingPortalSession(user, portalReturnUrl);
    return res.status(200).json({ platform, url: portal.url });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
});

export default router;
