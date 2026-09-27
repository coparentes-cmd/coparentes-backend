/**
 * File type detection from magic bytes (file signatures).
 * Used to reject uploads that only claim a safe mimeType/extension.
 */

/** Bytes needed to cover WEBP (offset 8–11) and HEIC ftyp brand. */
const PEEK_BYTES = 16;

/** Sample size for plain-text vs binary heuristic (TXT claim path). */
const TEXT_PEEK_BYTES = 512;

/**
 * Decode only the leading base64 slice — enough for signatures, not the whole file.
 * @param {string} base64String
 * @param {number} [maxBytes=PEEK_BYTES]
 * @returns {Buffer}
 */
export function peekDecodedBytes(base64String, maxBytes = PEEK_BYTES) {
  const normalized = String(base64String ?? '').replace(/\s/g, '');
  if (!normalized) {
    return Buffer.alloc(0);
  }
  // 3 binary bytes ↔ 4 base64 chars; round up to multiple of 4
  const charsNeeded = Math.ceil(maxBytes / 3) * 4;
  const slice = normalized.slice(0, Math.min(normalized.length, charsNeeded));
  try {
    return Buffer.from(slice, 'base64').subarray(0, maxBytes);
  } catch {
    return Buffer.alloc(0);
  }
}

function startsWithAscii(buf, ascii, offset = 0) {
  if (buf.length < offset + ascii.length) {
    return false;
  }
  for (let i = 0; i < ascii.length; i += 1) {
    if (buf[offset + i] !== ascii.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

/**
 * @param {string} base64String
 * @returns {'pdf'|'jpeg'|'png'|'webp'|'heic'|'doc'|'docx'|null}
 */
export function detectFileTypeFromBase64(base64String) {
  const buf = peekDecodedBytes(base64String, PEEK_BYTES);
  if (buf.length < 4) {
    return null;
  }

  // PDF: %PDF
  if (startsWithAscii(buf, '%PDF')) {
    return 'pdf';
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'png';
  }

  // WEBP: RIFF....WEBP
  if (
    startsWithAscii(buf, 'RIFF') &&
    buf.length >= 12 &&
    startsWithAscii(buf, 'WEBP', 8)
  ) {
    return 'webp';
  }

  // HEIC/HEIF: ....ftyp + brand heic/heif/mif1/msf1
  if (buf.length >= 12 && startsWithAscii(buf, 'ftyp', 4)) {
    const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
    if (
      brand === 'heic' ||
      brand === 'heif' ||
      brand === 'mif1' ||
      brand === 'msf1' ||
      brand === 'heix' ||
      brand === 'heim'
    ) {
      return 'heic';
    }
  }

  // DOC (OLE Compound File): D0 CF 11 E0
  if (
    buf[0] === 0xd0 &&
    buf[1] === 0xcf &&
    buf[2] === 0x11 &&
    buf[3] === 0xe0
  ) {
    return 'doc';
  }

  // DOCX (and other OOXML): ZIP local file header PK
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    return 'docx';
  }

  return null;
}

/**
 * TXT has no reliable magic bytes — claim is mime OR .txt extension (either is enough).
 * Content must still pass looksLikePlainText before acceptance.
 * @param {string|null|undefined} fileName
 * @param {string|null|undefined} mimeType
 */
export function isPlainTextClaim(fileName, mimeType) {
  const mime = String(mimeType ?? '')
    .trim()
    .toLowerCase();
  const name = String(fileName ?? '')
    .trim()
    .toLowerCase();
  return mime === 'text/plain' || name.endsWith('.txt');
}

/**
 * Heuristic: first ~512 decoded bytes look like text, not a binary payload.
 * - Rejects NUL (0x00) — typical in PE/ELF/OLE headers
 * - Allows TAB/LF/CR and printable ASCII; allows high bytes (UTF-8 Polish etc.)
 * - Rejects other C0 controls / DEL beyond a tiny absolute budget
 *
 * @param {Buffer} buf
 * @returns {boolean}
 */
export function looksLikePlainText(buf) {
  if (!buf || buf.length === 0) {
    return false;
  }

  let oddControls = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const b = buf[i];
    if (b === 0x00) {
      return false;
    }
    // Allowed whitespace
    if (b === 0x09 || b === 0x0a || b === 0x0d) {
      continue;
    }
    // Printable ASCII
    if (b >= 0x20 && b <= 0x7e) {
      continue;
    }
    // High bytes — treat as possible UTF-8 (Polish diacritics, etc.)
    if (b >= 0x80) {
      continue;
    }
    // Remaining: C0 controls + DEL
    oddControls += 1;
  }

  // Empty-ish control noise is enough to flag binary (MZ has 0x00 anyway).
  if (oddControls > 2) {
    return false;
  }
  if (oddControls / buf.length > 0.05) {
    return false;
  }
  return true;
}

function unsupportedFileType() {
  const error = new Error('unsupported_file_type');
  error.code = 'unsupported_file_type';
  return error;
}

/**
 * Validate upload content against magic bytes (+ TXT claim with text heuristic).
 * @returns {string} detected type or 'txt'
 * @throws {{ code: 'unsupported_file_type' }}
 */
export function assertAllowedDocumentContent(contentBase64, { fileName, mimeType } = {}) {
  const detected = detectFileTypeFromBase64(contentBase64);
  if (detected) {
    return detected;
  }

  if (isPlainTextClaim(fileName, mimeType)) {
    const sample = peekDecodedBytes(contentBase64, TEXT_PEEK_BYTES);
    // Do not trust mime/.txt alone — MZ/ELF/etc. often lack an "allowed" magic
    // match and would otherwise slip through as TXT.
    if (!looksLikePlainText(sample)) {
      throw unsupportedFileType();
    }
    return 'txt';
  }

  throw unsupportedFileType();
}
