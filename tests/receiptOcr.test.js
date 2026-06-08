import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectReceiptImageType,
  validateReceiptBase64
} from '../src/services/receiptOcr.js';

test('detectReceiptImageType accepts jpeg and png', () => {
  const jpeg = Buffer.alloc(128, 0);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  const png = Buffer.alloc(128, 0);
  png[0] = 0x89;
  png[1] = 0x50;
  png[2] = 0x4e;
  png[3] = 0x47;

  assert.equal(detectReceiptImageType(jpeg), 'image/jpeg');
  assert.equal(detectReceiptImageType(png), 'image/png');
});

test('validateReceiptBase64 rejects unsupported formats', () => {
  assert.throws(
    () => validateReceiptBase64(Buffer.from('hello world').toString('base64')),
    (error) => error.code === 'receipt_unsupported_format'
  );
});

test('validateReceiptBase64 rejects obviously truncated jpeg', () => {
  const truncated = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');

  assert.throws(
    () => validateReceiptBase64(truncated),
    (error) => error.code === 'receipt_unsupported_format'
  );
});
