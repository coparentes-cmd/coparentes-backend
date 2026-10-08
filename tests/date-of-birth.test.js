import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSameCalendarDay,
  normalizeDateOfBirth
} from '../src/utils/dateOfBirth.js';

describe('dateOfBirth utils', () => {
  it('normalizes any time on a UTC day to noon UTC', () => {
    const a = normalizeDateOfBirth('2013-07-23T22:00:00.000Z');
    const b = normalizeDateOfBirth('2013-07-23T00:00:00.000Z');
    const c = normalizeDateOfBirth('2013-07-23T12:00:00.000Z');
    assert.equal(a.toISOString(), '2013-07-23T12:00:00.000Z');
    assert.equal(b.toISOString(), '2013-07-23T12:00:00.000Z');
    assert.equal(c.toISOString(), '2013-07-23T12:00:00.000Z');
    assert.equal(isSameCalendarDay(a, b), true);
  });

  it('does not treat adjacent UTC days as the same', () => {
    const left = normalizeDateOfBirth('2013-07-22T22:00:00.000Z');
    const right = normalizeDateOfBirth('2013-07-23T22:00:00.000Z');
    assert.equal(isSameCalendarDay(left, right), false);
  });
});
