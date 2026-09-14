/**
 * Mints purchase keys for buyers. Run after a sale (itch.io / Gumroad / Ko-fi):
 *   LICENSE_SECRET=your-secret node scripts/genkeys.mjs 10
 * Keys are verified by the server with the same secret — no database required.
 */
import { createHmac, randomBytes } from 'node:crypto';

const secret = process.env.LICENSE_SECRET;
if (!secret) {
  console.error('LICENSE_SECRET is required (must match the value set on the server).');
  process.exit(1);
}

const count = Number(process.argv[2] ?? 1);
for (let i = 0; i < count; i++) {
  const serial = randomBytes(5).toString('hex').toUpperCase();
  const signature = createHmac('sha256', secret).update(serial).digest('hex').slice(0, 12).toUpperCase();
  console.log(`EDG-${serial}-${signature}`);
}
