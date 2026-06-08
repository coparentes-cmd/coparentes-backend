import Tesseract from 'tesseract.js';
import { parseReceiptText } from './receiptParser.js';

export const MAX_RECEIPT_BYTES = 512 * 1024;

export function validateReceiptBase64(contentBase64) {
  if (!contentBase64 || typeof contentBase64 !== 'string') {
    const error = new Error('receipt_missing');
    error.code = 'receipt_missing';
    throw error;
  }

  let buffer;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch {
    const error = new Error('receipt_invalid_base64');
    error.code = 'receipt_invalid_base64';
    throw error;
  }

  if (buffer.length === 0) {
    const error = new Error('receipt_empty');
    error.code = 'receipt_empty';
    throw error;
  }

  if (buffer.length > MAX_RECEIPT_BYTES) {
    const error = new Error('receipt_too_large');
    error.code = 'receipt_too_large';
    throw error;
  }

  return buffer;
}

export async function parseReceiptImage({ contentBase64, mimeType }) {
  validateReceiptBase64(contentBase64);
  const buffer = Buffer.from(contentBase64, 'base64');

  const { data } = await Tesseract.recognize(buffer, 'pol+eng', {
    logger: () => {}
  });

  const parsed = parseReceiptText(data.text ?? '');

  return {
    ...parsed,
    mimeType: mimeType ?? 'image/jpeg',
    engine: 'tesseract'
  };
}
