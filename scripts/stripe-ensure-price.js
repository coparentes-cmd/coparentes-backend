/**
 * Creates Coparentes Mobile product + 29.99 PLN/mo price in Stripe Test mode
 * if STRIPE_PRICE_ID is missing. Prints the price id (safe to put in .env).
 *
 * Usage: node scripts/stripe-ensure-price.js
 */
import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret) {
  console.error('Missing STRIPE_SECRET_KEY in .env');
  process.exit(1);
}
if (!secret.startsWith('sk_test_')) {
  console.error('Refusing to run: STRIPE_SECRET_KEY is not a Test mode key (sk_test_…).');
  process.exit(1);
}

if (process.env.STRIPE_PRICE_ID?.trim()) {
  console.log(`STRIPE_PRICE_ID already set: ${process.env.STRIPE_PRICE_ID.trim()}`);
  process.exit(0);
}

const stripe = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });

const existing = await stripe.prices.list({
  active: true,
  limit: 20,
  expand: ['data.product']
});
const match = existing.data.find((price) => {
  const product = price.product;
  const name = typeof product === 'object' && product ? product.name : '';
  return (
    price.currency === 'pln' &&
    price.unit_amount === 2999 &&
    price.recurring?.interval === 'month' &&
    String(name).includes('Coparentes')
  );
});

if (match) {
  console.log(`Found existing price: ${match.id}`);
  console.log('Add to .env: STRIPE_PRICE_ID=' + match.id);
  process.exit(0);
}

const product = await stripe.products.create({
  name: 'Coparentes Mobile',
  description: 'Subskrypcja aplikacji mobilnej Coparentes (29,99 zł/mies.)',
  metadata: { app: 'coparentes', platform: 'mobile' }
});

const price = await stripe.prices.create({
  product: product.id,
  currency: 'pln',
  unit_amount: 2999,
  recurring: { interval: 'month' },
  metadata: { app: 'coparentes' }
});

console.log(`Created product ${product.id}`);
console.log(`Created price ${price.id}`);
console.log('Add to .env: STRIPE_PRICE_ID=' + price.id);
