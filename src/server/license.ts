import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Offline-verifiable purchase keys: `EDG-<serial>-<signature>`. Keys are minted with
 * scripts/genkeys.mjs after a sale and verified here without any database.
 * The paywall is enabled only in explicit production deployments, so local dev keeps running
 * even when a LICENSE_SECRET is present in the shell environment.
 */
const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const isProduction = (processEnv.NODE_ENV ?? '').toLowerCase() === 'production';
const SECRET = isProduction ? (processEnv.LICENSE_SECRET ?? '') : '';

export const paywallEnabled = isProduction && SECRET.length > 0;

export function signSerial(serial: string, secret: string = SECRET): string {
  return createHmac('sha256', secret).update(serial).digest('hex').slice(0, 12).toUpperCase();
}

export function verifyKey(key: unknown): boolean {
  if (!paywallEnabled) return true;
  if (typeof key !== 'string') return false;
  const parts = key.trim().toUpperCase().split('-');
  if (parts.length !== 3 || parts[0] !== 'EDG') return false;
  const expected = Buffer.from(signSerial(parts[1]));
  const provided = Buffer.from(parts[2]);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
