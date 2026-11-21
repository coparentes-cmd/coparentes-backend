import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MOBILE_TRIAL_DAYS,
  billingPublicFields,
  hasMobileAppAccess,
  isMobilePlatform,
  normalizeClientPlatform
} from '../src/services/entitlement.service.js';

function user(overrides = {}) {
  return {
    id: 'u1',
    role: 'parentA',
    billingStatus: 'none',
    trialStartedAt: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    billingSource: null,
    ...overrides
  };
}

describe('normalizeClientPlatform', () => {
  it('maps ios variants and defaults to web', () => {
    assert.equal(normalizeClientPlatform('ios'), 'ios');
    assert.equal(normalizeClientPlatform('iPhone'), 'ios');
    assert.equal(normalizeClientPlatform('android'), 'android');
    assert.equal(normalizeClientPlatform('web'), 'web');
    assert.equal(normalizeClientPlatform(undefined), 'web');
    assert.equal(normalizeClientPlatform('desktop'), 'web');
  });
});

describe('isMobilePlatform', () => {
  it('is true only for ios/android', () => {
    assert.equal(isMobilePlatform('ios'), true);
    assert.equal(isMobilePlatform('android'), true);
    assert.equal(isMobilePlatform('web'), false);
  });
});

describe('hasMobileAppAccess', () => {
  it('always allows child and web', () => {
    assert.equal(
      hasMobileAppAccess(user({ role: 'child', billingStatus: 'none' }), 'ios'),
      true
    );
    assert.equal(hasMobileAppAccess(user({ billingStatus: 'none' }), 'web'), true);
  });

  it('allows mobile trialing only while trialEndsAt is in the future', () => {
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);
    assert.equal(
      hasMobileAppAccess(
        user({ billingStatus: 'trialing', trialEndsAt: future }),
        'ios'
      ),
      true
    );
    assert.equal(
      hasMobileAppAccess(
        user({ billingStatus: 'trialing', trialEndsAt: past }),
        'ios'
      ),
      false
    );
  });

  it('allows active; denies none/expired/canceled on mobile', () => {
    assert.equal(
      hasMobileAppAccess(user({ billingStatus: 'active' }), 'android'),
      true
    );
    assert.equal(hasMobileAppAccess(user({ billingStatus: 'none' }), 'ios'), false);
    assert.equal(
      hasMobileAppAccess(user({ billingStatus: 'expired' }), 'ios'),
      false
    );
    assert.equal(
      hasMobileAppAccess(user({ billingStatus: 'canceled' }), 'ios'),
      false
    );
  });
});

describe('billingPublicFields', () => {
  it('serializes ISO dates and defaults', () => {
    const started = new Date('2026-11-01T00:00:00.000Z');
    const ends = new Date('2026-12-01T00:00:00.000Z');
    const fields = billingPublicFields(
      user({
        billingStatus: 'trialing',
        trialStartedAt: started,
        trialEndsAt: ends,
        billingSource: 'manual'
      })
    );
    assert.equal(fields.billingStatus, 'trialing');
    assert.equal(fields.trialStartedAt, started.toISOString());
    assert.equal(fields.trialEndsAt, ends.toISOString());
    assert.equal(fields.currentPeriodEnd, null);
    assert.equal(fields.billingSource, 'manual');
  });
});

describe('MOBILE_TRIAL_DAYS', () => {
  it('is 30 days', () => {
    assert.equal(MOBILE_TRIAL_DAYS, 30);
  });
});
