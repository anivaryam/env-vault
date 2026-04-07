/**
 * Core vault operations
 * Encrypts/decrypts .env files using random-universe-cipher
 *
 * Vault format: header line + base64(salt || aeadEncrypt(content))
 * Where aeadEncrypt output = nonce (16) || ciphertext || tag (32)
 */

import {
  aeadEncrypt,
  aeadDecrypt,
  deriveKeyArgon2,
  generateSalt,
  stringToBytes,
  bytesToString,
} from 'random-universe-cipher';

const HEADER = '#:env-vault:v1:ruc';
const SALT_SIZE = 16;
const BASE64_LINE_WIDTH = 76;

/**
 * Encrypt .env content into vault format
 */
export async function seal(content, password) {
  const salt = generateSalt();
  const { key } = await deriveKeyArgon2(password, salt, 'interactive');

  const plainBytes = stringToBytes(content);
  const encrypted = aeadEncrypt(plainBytes, key);

  // Bundle: salt || encrypted (nonce || ciphertext || tag)
  const bundle = new Uint8Array(SALT_SIZE + encrypted.length);
  bundle.set(salt, 0);
  bundle.set(encrypted, SALT_SIZE);

  const b64 = uint8ToBase64(bundle);
  const wrapped = wrapBase64(b64);
  return `${HEADER}\n${wrapped}\n`;
}

/**
 * Decrypt vault content back to .env format
 */
export async function open(vaultContent, password) {
  const lines = vaultContent.split('\n');

  if (!lines[0]?.startsWith('#:env-vault')) {
    throw new Error('Not a valid env-vault file');
  }

  const b64 = lines
    .slice(1)
    .filter((l) => l.trim() && !l.startsWith('#'))
    .join('');

  const bundle = base64ToUint8(b64);

  if (bundle.length < SALT_SIZE + 16 + 32 + 32) {
    throw new Error('Vault data too short');
  }

  const salt = bundle.subarray(0, SALT_SIZE);
  const encrypted = bundle.subarray(SALT_SIZE);

  const { key } = await deriveKeyArgon2(password, salt, 'interactive');
  const decrypted = aeadDecrypt(encrypted, key);

  return bytesToString(decrypted);
}

/**
 * Parse .env content into key-value pairs
 * Only used for diff/get — seal/open preserve the file exactly
 */
export function parseEnv(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const stripped = trimmed.startsWith('export ')
      ? trimmed.slice(7).trim()
      : trimmed;

    const eqIdx = stripped.indexOf('=');
    if (eqIdx === -1) continue;

    const key = stripped.slice(0, eqIdx).trim();
    let value = stripped.slice(eqIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }
  return vars;
}

function uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function wrapBase64(base64) {
  const lines = [];
  for (let i = 0; i < base64.length; i += BASE64_LINE_WIDTH) {
    lines.push(base64.slice(i, i + BASE64_LINE_WIDTH));
  }
  return lines.join('\n');
}
