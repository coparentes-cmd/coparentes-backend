import {
  constructStripeWebhookEvent,
  handleStripeWebhookEvent
} from '../services/stripe.service.js';

/**
 * POST /api/billing/webhook
 * Must be mounted with express.raw({ type: 'application/json' }) BEFORE json parser.
 */
export async function stripeWebhookHandler(req, res) {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'missing_stripe_signature' });
  }

  try {
    const event = constructStripeWebhookEvent(req.body, signature);
    await handleStripeWebhookEvent(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    const status = error.status || 400;
    console.error('[stripe webhook]', error.message);
    return res.status(status).json({ error: error.message || 'webhook_failed' });
  }
}
