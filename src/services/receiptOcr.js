import Tesseract from 'tesseract.js';
import { parseReceiptText } from './receiptParser.js';

export const MAX_RECEIPT_BYTES = 512 * 1024;

function throwReceiptError(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validateImageStructure(buffer, type) {
  if (type === 'image/jpeg') {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return false;
    }
    for (let i = buffer.length - 2; i >= 0; i -= 1) {
      if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
        return true;
      }
    }
    return false;
  }

  if (type === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < signature.length; i += 1) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }
    return buffer.includes(Buffer.from('IEND'));
  }

  if (type === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP' &&
      buffer.length >= 64
    );
  }

  return false;
}

export function detectReceiptImageType(buffer) {
  if (!buffer || buffer.length < 64) {
    throwReceiptError('receipt_unsupported_format');
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  throwReceiptError('receipt_unsupported_format');
}

export function validateReceiptBase64(contentBase64) {
  if (!contentBase64 || typeof contentBase64 !== 'string') {
    throwReceiptError('receipt_missing');
  }

  let buffer;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch {
    throwReceiptError('receipt_invalid_base64');
  }

  if (buffer.length === 0) {
    throwReceiptError('receipt_empty');
  }

  if (buffer.length > MAX_RECEIPT_BYTES) {
    throwReceiptError('receipt_too_large');
  }

  detectReceiptImageType(buffer);

  return buffer;
}

export async function parseReceiptImage({ contentBase64, mimeType }) {
  const buffer = validateReceiptBase64(contentBase64);
  const detectedType = detectReceiptImageType(buffer);

  if (!validateImageStructure(buffer, detectedType)) {
    throwReceiptError('receipt_unreadable');
  }

  let data;
  try {
    ({ data } = await Tesseract.recognize(buffer, 'pol', {
      logger: () => {}
    }));
  } catch {
    throwReceiptError('receipt_unreadable');
  }

  const parsed = parseReceiptText(data.text ?? '');

  return {
    ...parsed,
    mimeType: mimeType ?? detectedType,
    engine: 'tesseract'
  };
}
