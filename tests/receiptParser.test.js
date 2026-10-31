import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText } from '../src/services/receiptParser.js';

test('parseReceiptText extracts amount, title and category', () => {
  const parsed = parseReceiptText(
    'APTEKA ZDROWIE\n12.03.2026\nSUMA 28,50 PLN'
  );

  assert.equal(parsed.title, 'Apteka');
  assert.equal(parsed.amount, 28.5);
  assert.equal(parsed.category, 'Zdrowie');
});

test('TK Maxx receipt: prefers brand over OCR garbage title', () => {
  const parsed = parseReceiptText(`
PARRUUK FI KALRY
TJX Poland Sp. z o.o.
TK Maxx Tel: 93-570 Łódź
NIP 7010180987
81/19 Para poduszek ozdobnych 1 szt * 99,99
90/46 Wycieraczka 1 szt * 94,99
SUMA PLN 194,98
Kwota PTU A 23,00% 36,46
ROZLICZENIE PŁATNOŚCI Płatność Kartą 194,98
14.10.2026 14:33
`);

  assert.equal(parsed.title, 'TK Maxx');
  assert.equal(parsed.amount, 194.98);
  assert.equal(parsed.category, 'Ubrania');
  assert.equal(parsed.confidence, 'high');
  assert.ok(parsed.date?.startsWith('2026-10-14'));
});

test('rejects consonant-heavy OCR noise as title', () => {
  const parsed = parseReceiptText(`
PARRUUK FI KALRY
Biedronka
SUMA 12,99 PLN
`);
  assert.equal(parsed.title, 'Biedronka');
  assert.equal(parsed.category, 'Jedzenie');
});
