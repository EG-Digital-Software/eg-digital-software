import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Reversible encryption for admin-provisioned client passwords.
 *
 * This is deliberately NOT how passwords are authenticated — login always uses
 * the one-way argon2 hash. This box only exists so an admin can *reveal* the
 * password they (or the customer) set, which the product explicitly requires.
 * AES-256-GCM gives confidentiality + tamper detection; the key lives in the
 * server env and never leaves it.
 */

const ALGO = 'aes-256-gcm';

/** Parse the configured key (64 hex chars or base64) into 32 raw bytes. */
function loadKey(): Buffer | null {
  const raw = env.CREDENTIAL_ENC_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    logger.warn('CREDENTIAL_ENC_KEY must decode to 32 bytes — credential reveal disabled');
    return null;
  }
  return buf;
}

/** Whether password reveal is available (a valid key is configured). */
export function credentialEncryptionReady(): boolean {
  return loadKey() !== null;
}

/** Encrypt a password to a self-contained "iv.tag.ciphertext" base64 string. */
export function encryptSecret(plain: string): string | null {
  const key = loadKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/** Decrypt a value produced by encryptSecret. Returns null if unreadable. */
export function decryptSecret(payload: string | null | undefined): string | null {
  const key = loadKey();
  if (!key || !payload) return null;
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch (err) {
    logger.warn({ err }, 'Failed to decrypt a stored credential');
    return null;
  }
}
