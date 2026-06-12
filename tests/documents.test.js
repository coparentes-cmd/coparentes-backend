import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedDocumentCategory,
  isPrivateDocument,
  PRIVATE_DOCUMENT_CATEGORY
} from '../src/services/documents.js';

test('Private is an allowed document category', () => {
  assert.equal(isAllowedDocumentCategory(PRIVATE_DOCUMENT_CATEGORY), true);
});

test('isPrivateDocument detects private category', () => {
  assert.equal(
    isPrivateDocument({ category: PRIVATE_DOCUMENT_CATEGORY }),
    true
  );
  assert.equal(isPrivateDocument({ category: 'Shared' }), false);
});
