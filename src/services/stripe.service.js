import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { env } from '../utils/env.js';

let stripeClient = null;

export function isStripeConfigured() {
  return Boolean(env.stripeSecretKey?.trim() && env.stripePriceId?.trim());
}

export function getStripe() {
  if (!env.stripeSecretKey?.trim()) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey, {
      apiVersion: '2025-02-24.acacia'
    });
  }
  return stripeClient;
}

/**
 * Create or reuse a Stripe Customer for the user (Test mode).
 * @param {import('@prisma/client').User} user
 */
export async function ensureStripeCustomer(user) {
  const stripe = getStripe();
  if (!stripe) {
    throw Object.assign(new Error('stripe_not_configured'), { status: 503 });
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: user.id, workspaceId: user.workspaceId || '' }
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customer.id,
      billingSource: user.billingSource ?? 'stripe'
    }
  });

  return customer.id;
}

/**
 * @param {import('@prisma/client').User} user
 * @param {{ successUrl: string, cancelUrl: string }} urls
 */
export async function createCheckoutSession(user, urls) {
  const stripe = getStripe();
  if (!stripe || !env.stripePriceId?.trim()) {
    throw Object.assign(new Error('stripe_not_configured'), { status: 503 });
  }
  if (user.role === 'child') {
    throw Object.assign(new Error('child_not_billable'), { status: 403 });
  }

  const customerId = await ensureStripeCustomer(user);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: env.stripePriceId, quantity: 1 }],
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    metadata: { userId: user.id },
    subscription_data: {
      metadata: { userId: user.id }
    },
    allow_promotion_codes: true
  });

  return {
    sessionId: session.id,
    url: session.url
  };
}

/**
 * @param {import('@prisma/client').User} user
 */
export async function createBillingPortalSession(user, returnUrl) {
  const stripe = getStripe();
  if (!stripe) {
    throw Object.assign(new Error('stripe_not_configured'), { status: 503 });
  }
  if (!user.stripeCustomerId) {
    throw Object.assign(new Error('no_stripe_customer'), { status: 409 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl
  });

  return { url: portal.url };
}

/**
 * Map Stripe subscription → User billing fields.
 * @param {import('stripe').Stripe.Subscription} subscription
 * @param {string} [userIdHint]
 */
export async function applySubscriptionToUser(subscription, userIdHint) {
  const userId =
    userIdHint ||
    subscription.metadata?.userId ||
    (typeof subscription.customer === 'string'
      ? (
          await prisma.user.findFirst({
            where: { stripeCustomerId: subscription.customer }
          })
        )?.id
      : null);

  if (!userId) {
    return null;
  }

  const periodEndSec = subscription.current_period_end;
  const currentPeriodEnd = periodEndSec
    ? new Date(periodEndSec * 1000)
    : null;

  let billingStatus = 'expired';
  if (subscription.status === 'active' || subscription.status === 'past_due') {
    billingStatus = 'active';
  } else if (subscription.status === 'trialing') {
    // Our SaaS trial is separate; Stripe trial still maps to active access.
    billingStatus = 'active';
  } else if (subscription.status === 'canceled') {
    billingStatus = 'canceled';
  }

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  return prisma.user.update({
    where: { id: userId },
    data: {
      billingStatus,
      billingSource: 'stripe',
      stripeSubscriptionId: subscription.id,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      currentPeriodEnd
    }
  });
}

/**
 * @param {import('stripe').Stripe.Event} event
 */
export async function handleStripeWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription') {
        return { handled: false };
      }
      const userId = session.metadata?.userId || session.client_reference_id;
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

      if (userId && customerId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: customerId,
            billingSource: 'stripe',
            ...(subscriptionId
              ? { stripeSubscriptionId: subscriptionId, billingStatus: 'active' }
              : {})
          }
        });
      }

      if (subscriptionId) {
        const stripe = getStripe();
        if (stripe) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await applySubscriptionToUser(subscription, userId || undefined);
        }
      }
      return { handled: true };
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
    case 'customer.subscription.deleted': {
      await applySubscriptionToUser(event.data.object);
      return { handled: true };
    }
    default:
      return { handled: false };
  }
}

export function constructStripeWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe || !env.stripeWebhookSecret?.trim()) {
    throw Object.assign(new Error('stripe_webhook_not_configured'), {
      status: 503
    });
  }
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    env.stripeWebhookSecret
  );
}
