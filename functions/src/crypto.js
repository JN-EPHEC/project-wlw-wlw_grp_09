const { createCipheriv, createDecipheriv, randomBytes, createHash } = require('crypto');

const SHARED_SECRET = process.env.DRIVER_DOC_SECRET || 'campusride-driver-docs-dev-key!!';
const KEY = createHash('sha256').update(SHARED_SECRET).digest();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const encrypt = (buffer) => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

const decrypt = (payloadB64) => {
  const payload = Buffer.from(payloadB64, 'base64');
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = payload.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

module.exports = { encrypt, decrypt };
