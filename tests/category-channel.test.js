import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getOrCreateCategoryThread } from '../src/services/threads.js';

describe('getOrCreateCategoryThread', () => {
  it('exports a function without calling createThread recursively', () => {
    assert.equal(typeof getOrCreateCategoryThread, 'function');
    assert.match(
      getOrCreateCategoryThread.toString(),
      /\.thread\.create/,
      'should create channel threads directly via prisma/tx'
    );
    assert.doesNotMatch(
      getOrCreateCategoryThread.toString(),
      /return createThread\(/,
      'must not delegate back to createThread (infinite loop)'
    );
  });
});
