const crypto = require("node:crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const derivedKey = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expectedHash, "hex"),
    Buffer.from(derivedKey, "hex"),
  );
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createIntegrityHash(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function createInviteCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  createIntegrityHash,
  createInviteCode,
};
