import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Offline-verifiable purchase keys: `EDG-<serial>-<signature>`. Keys are minted with
 * scripts/genkeys.mjs after a sale and verified here without any database.
 * The paywall is disabled entirely when LICENSE_SECRET is unset (free/dev mode).
 */
const SECRET =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.LICENSE_SECRET ?? '';

export const paywallEnabled = SECRET.length > 0;

export function signSerial(serial: string, secret: string = SECRET): string {
  return createHmac('sha256', secret).update(serial).digest('hex').slice(0, 12).toUpperCase();
}

export function verifyKey(key: unknown): boolean {
  if (!paywallEnabled) return true;
  if (typeof key !== 'string') return false;

  const parts = key.trim().toUpperCase().split('-');
  if (parts.length !== 3 || parts[0] !== 'EDG') return false;

  const serial = parts[1];
  const signature = parts[2];
  if (!/^[A-F0-9]+$/i.test(serial) || !/^[A-F0-9]+$/i.test(signature)) return false;

  const expected = Buffer.from(signSerial(serial));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
