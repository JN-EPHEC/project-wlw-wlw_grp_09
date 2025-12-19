import * as FileSystem from 'expo-file-system';

/**
 * Lightweight symmetric cipher utilities used to encrypt driver documents before upload.
 * This is a custom stream cipher derived from a shared secret and a per-upload nonce.
 * It is intentionally simple (no external dependency) but still ensures that raw bytes
 * are not sent in clair text. For production, you should swap this with a standard
 * implementation such as AES-GCM or XChaCha20-Poly1305.
 */

let cachedTextEncoder: TextEncoder | null = null;
const getTextEncoder = () => {
  if (cachedTextEncoder) return cachedTextEncoder;
  if (typeof TextEncoder === 'undefined') return null;
  cachedTextEncoder = new TextEncoder();
  return cachedTextEncoder;
};

const DEFAULT_SECRET = 'campusride-driver-docs-dev-key!!';

const SECRET_KEY = process.env.EXPO_PUBLIC_DRIVER_DOC_KEY ?? DEFAULT_SECRET;
const KEY_BYTES = (() => {
  const base = encodeUtf8(SECRET_KEY);
  const buffer = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    buffer[i] = base[i % base.length] ^ ((i * 31) & 0xff);
  }
  return buffer;
})();

const NONCE_LENGTH = 12;

export type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  checksum: string;
  byteLength: number;
};

const sanitizeBase64 = (value: string) => value.replace(/[^A-Za-z0-9+/=]/g, '');

function base64ToUint8Array(base64: string) {
  const sanitized = sanitizeBase64(base64);
  if (!sanitized) return new Uint8Array();
  const bufferLength = Math.floor((sanitized.length * 3) / 4);
  const bytes = new Uint8Array(bufferLength);
  let byteIndex = 0;
  for (let i = 0; i < sanitized.length; i += 4) {
    const chunk =
      (base64CharToInt(sanitized.charCodeAt(i)) << 18) |
      (base64CharToInt(sanitized.charCodeAt(i + 1)) << 12) |
      (base64CharToInt(sanitized.charCodeAt(i + 2)) << 6) |
      base64CharToInt(sanitized.charCodeAt(i + 3));
    bytes[byteIndex++] = (chunk >> 16) & 0xff;
    if (sanitized[i + 2] !== '=') {
      bytes[byteIndex++] = (chunk >> 8) & 0xff;
    }
    if (sanitized[i + 3] !== '=') {
      bytes[byteIndex++] = chunk & 0xff;
    }
  }
  return bytes.subarray(0, byteIndex);
}

function uint8ArrayToBase64(bytes: Uint8Array) {
  const base64Table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk =
      ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    output += base64Table[(chunk >> 18) & 63];
    output += base64Table[(chunk >> 12) & 63];
    output += bytes.length > i + 1 ? base64Table[(chunk >> 6) & 63] : '=';
    output += bytes.length > i + 2 ? base64Table[chunk & 63] : '=';
  }
  return output;
}

function base64CharToInt(charCode: number) {
  if (charCode >= 65 && charCode <= 90) return charCode - 65;
  if (charCode >= 97 && charCode <= 122) return charCode - 71;
  if (charCode >= 48 && charCode <= 57) return charCode + 4;
  if (charCode === 43) return 62;
  if (charCode === 47) return 63;
  return 0;
}

function encodeUtf8(value: string) {
  const encoder = getTextEncoder();
  if (encoder) {
    return encoder.encode(value);
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function getRandomBytes(length: number) {
  const array = new Uint8Array(length);
  const cryptoObj = (globalThis as any)?.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(array);
    return array;
  }
  for (let i = 0; i < length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

function deriveStream(nonce: Uint8Array, length: number) {
  const stream = new Uint8Array(length);
  const counter = new Uint8Array(16);
  counter.set(nonce, 0);
  let carry = 0;
  for (let i = 0; i < length; i++) {
    const keyByte = KEY_BYTES[(i + nonce[i % nonce.length]) % KEY_BYTES.length];
    const ctrIndex = i % counter.length;
    const sum = counter[ctrIndex] + keyByte + carry;
    counter[ctrIndex] = sum & 0xff;
    carry = sum >> 8;
    const rotate = (counter[ctrIndex] % 7) + 1;
    const rotated = ((keyByte << rotate) | (keyByte >>> (8 - rotate))) & 0xff;
    stream[i] = rotated ^ counter[ctrIndex];
  }
  return stream;
}

function xorBytes(message: Uint8Array, stream: Uint8Array) {
  const result = new Uint8Array(message.length);
  for (let i = 0; i < message.length; i++) {
    result[i] = message[i] ^ stream[i];
  }
  return result;
}

function computeChecksum(bytes: Uint8Array) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function encryptBytes(message: Uint8Array): EncryptedPayload {
  const nonce = getRandomBytes(NONCE_LENGTH);
  const stream = deriveStream(nonce, message.length);
  const cipher = xorBytes(message, stream);
  const checksum = computeChecksum(cipher).toString(16);
  return {
    ciphertext: uint8ArrayToBase64(cipher),
    nonce: uint8ArrayToBase64(nonce),
    checksum,
    byteLength: message.length,
  };
}

export async function encryptFileUri(uri: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const messageBytes = base64ToUint8Array(base64);
  return encryptBytes(messageBytes);
}

export function encryptStringPayload(value: string) {
  const messageBytes = encodeUtf8(value);
  return encryptBytes(messageBytes);
}

export function decodeBase64ToBytes(value: string) {
  return base64ToUint8Array(value);
}

export function encodeBytesToBase64(value: Uint8Array) {
  return uint8ArrayToBase64(value);
}

export type BinaryHelpers = {
  encode: typeof encodeBytesToBase64;
  decode: typeof decodeBase64ToBytes;
};
