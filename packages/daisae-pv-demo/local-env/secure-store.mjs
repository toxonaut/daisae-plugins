import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {pythonJSON} from './runtime.mjs';

export const PREFIX = 'DAISAE_ENC:';
const keyId = key => createHash('sha256').update(key).digest('hex').slice(0, 24);
const aad = name => Buffer.from(`daisae.environment.v1\0${name}`, 'utf8');
function validateKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('The stored encryption key is invalid. It has not been replaced.');
}
export function encryptValue(name, value, key) {
  validateKey(key);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {authTagLength: 16});
  cipher.setAAD(aad(name));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}v1:${keyId(key)}:${Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64')}`;
}
export function decryptValue(name, value, key) {
  if (!value.startsWith(PREFIX)) return value;
  validateKey(key);
  const match = /^DAISAE_ENC:v1:([a-f0-9]{24}):([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('An encrypted value has an unsupported version or invalid format. The file has not been changed.');
  if (match[1] !== keyId(key)) throw new Error('This file needs a different encryption key. Restore its original credential; existing values have not been changed.');
  const payload = Buffer.from(match[2], 'base64');
  if (payload.length < 28 || payload.toString('base64') !== match[2]) throw new Error('An encrypted value is damaged. The file has not been changed.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12), {authTagLength: 16});
    decipher.setAAD(aad(name));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
  } catch {throw new Error('An encrypted value failed authentication. The file has not been changed.');}
}
export async function nativeKey(create = false) {
  const result = await pythonJSON('credentials.py', {action: create ? 'ensure' : 'get'});
  const key = Buffer.from(result.key, 'base64');
  validateKey(key);
  return key;
}

// Dependency injection is only a code-level test seam, never an env-var bypass.
export function createSecureStore({keyProvider = nativeKey, rawStore = request => pythonJSON('store.py', request)} = {}) {
  function decoded(raw, key) {
    return {...raw, rows: raw.rows.map(row => ({...row, value: decryptValue(row.name, row.value, key)})),
      needsEncryption: raw.rows.some(row => row.assigned && !row.value.startsWith(PREFIX))};
  }
  return async function store(request) {
    if (!['read', 'save'].includes(request.action)) throw new Error('Unknown environment action.');
    const raw = await rawStore({action: 'read', directory: request.directory});
    const encrypted = raw.rows.some(row => row.value.startsWith(PREFIX));
    // Never generate a replacement key when trying to open an encrypted file.
    const key = await keyProvider(!encrypted);
    try {
      const current = decoded(raw, key);
      if (request.action === 'read') return current;
      if (request.revision !== raw.revision) throw new Error('The .env file changed outside this panel. Reload before saving.');
      const rows = request.rows;
      if (!Array.isArray(rows) || rows.length > 500) throw new Error('At most 500 variables are supported.');
      const names = new Set();
      for (const row of rows) {
        if (!row || typeof row.name !== 'string' || row.name.length > 200 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.name) || names.has(row.name)) throw new Error('Use unique valid variable names.');
        names.add(row.name);
        if (typeof row.value !== 'string' || row.value.includes('\0') || row.value.length > 65536 || typeof row.assigned !== 'boolean' || (!row.assigned && row.value !== '')) throw new Error('A variable contains unsupported data or exceeds 64 KB.');
      }
      const previous = new Map(raw.rows.map((row, i) => [row.name, {raw: row, plain: current.rows[i]}]));
      const storedRows = rows.map(row => {
        if (!row.assigned) return row;
        const old = previous.get(row.name);
        const unchanged = old?.raw.assigned && old.raw.value.startsWith(PREFIX) && old.plain.value === row.value;
        return {...row, value: unchanged ? old.raw.value : encryptValue(row.name, row.value, key)};
      });
      // The raw writer repeats the revision check under its OS lock.
      return decoded(await rawStore({...request, rows: storedRows}), key);
    } finally {key.fill(0);}
  };
}
export const secureStore = createSecureStore();
