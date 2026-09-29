/**
 * X25519 public key in standard base64:
 * - alphabet A–Z a–z 0–9 + / with optional = padding
 * - encoded length multiple of 4
 * - decoded payload exactly 32 bytes
 * (Node Buffer.from(..., 'base64') does not throw on garbage — length/format checks are required.)
 */
export function isValidX25519PublicKeyBase64(value) {
  const str = String(value);
  if (!/^[A-Za-z0-9+/]+=*$/.test(str) || str.length % 4 !== 0) {
    return false;
  }
  try {
    const buf = Buffer.from(str, 'base64');
    return buf.length === 32;
  } catch {
    return false;
  }
}
