import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isMobilePlatform,
  normalizeClientPlatform
} from '../src/services/entitlement.service.js';
import { isStripeConfigured } from '../src/services/stripe.service.js';

describe('Stripe Checkout mobile gate helpers', () => {
  it('treats only ios/android as mobile for checkout', () => {
    assert.equal(isMobilePlatform(normalizeClientPlatform('ios')), true);
    assert.equal(isMobilePlatform(normalizeClientPlatform('android')), true);
    assert.equal(isMobilePlatform(normalizeClientPlatform('web')), false);
  });

  it('isStripeConfigured reflects env (no throw without keys)', () => {
    assert.equal(typeof isStripeConfigured(), 'boolean');
  });
});
