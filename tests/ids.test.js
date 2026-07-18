import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  entityIdSchema,
  parseEntityId,
  requireEntityId
} from '../src/utils/ids.js';

describe('entity id guards (NoSQL / operator injection)', () => {
  it('accepts cuid-like and uuid-like strings', () => {
    assert.equal(parseEntityId('clxyz123abc'), 'clxyz123abc');
    assert.equal(
      parseEntityId('att_550e8400-e29b-41d4-a716-446655440000'),
      'att_550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('rejects operator-shaped objects', () => {
    assert.throws(() => requireEntityId({ $ne: null }, 'userId'));
    assert.throws(() => parseEntityId({ gt: '' }, 'threadId'));
    assert.equal(entityIdSchema.safeParse({ $gt: '' }).success, false);
  });

  it('rejects empty and oversized ids', () => {
    assert.throws(() => parseEntityId(''));
    assert.throws(() => parseEntityId('a'.repeat(81)));
  });
});
