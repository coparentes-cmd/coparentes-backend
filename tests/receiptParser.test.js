import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText } from '../src/services/receiptParser.js';

test('parseReceiptText extracts amount, title and category', () => {
  const parsed = parseReceiptText(
    'APTEKA ZDROWIE\n12.03.2026\nSUMA 28,50 PLN'
  );

  assert.equal(parsed.title, 'APTEKA ZDROWIE');
  assert.equal(parsed.amount, 28.5);
  assert.equal(parsed.category, 'Zdrowie');
});
