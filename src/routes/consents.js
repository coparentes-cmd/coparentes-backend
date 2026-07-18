import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  ALL_CONSENT_TYPES,
  getCurrentUserConsents,
  updateUserConsent
} from '../services/consent.service.js';

const router = express.Router();

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const consents = await getCurrentUserConsents(req.user.id);
    return res.json({ consents });
  } catch (error) {
    return next(error);
  }
});

const updateConsentSchema = z.object({
  granted: z.boolean()
});

router.patch('/:consentType', requireAuth, async (req, res, next) => {
  try {
    const consentTypeRaw = req.params.consentType;
    if (typeof consentTypeRaw !== 'string') {
      return res.status(400).json({ error: 'invalid_consent_type' });
    }
    const consentType = consentTypeRaw.toUpperCase();
    if (!ALL_CONSENT_TYPES.includes(consentType)) {
      return res.status(400).json({ error: 'invalid_consent_type' });
    }

    const data = updateConsentSchema.parse(req.body);
    const result = await updateUserConsent({
      userId: req.user.id,
      consentType,
      granted: data.granted,
      ipAddress: clientIp(req)
    });

    if (result.error) {
      const status = result.error === 'required_consent_locked' ? 403 : 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
