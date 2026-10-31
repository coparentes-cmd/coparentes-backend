import test from 'node:test';
import assert from 'node:assert/strict';
import { canUserSendMessage } from '../src/services/threads.js';

test('parents can send in Zmiana grafiku system channel; children cannot', () => {
  const scheduleThread = {
    isSystemChannel: true,
    audience: 'parents'
  };
  const familyThread = {
    isSystemChannel: false,
    audience: 'family'
  };

  assert.equal(canUserSendMessage('parentA', scheduleThread), true);
  assert.equal(canUserSendMessage('parentB', scheduleThread), true);
  assert.equal(canUserSendMessage('child', scheduleThread), false);

  assert.equal(canUserSendMessage('child', familyThread), true);
  assert.equal(canUserSendMessage('parentA', familyThread), true);
});
