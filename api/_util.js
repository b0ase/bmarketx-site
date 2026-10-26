import { readCookie, verifySession } from '@bwalletx/connect/server';
import { secret } from './bwalletx/_auth.js';
export { body } from './bwalletx/_auth.js';

/** The signed-in bWalletX identity key, or null. */
export async function who(req) {
  const s = secret();
  if (!s) return null;
  const p = await verifySession(readCookie(req.headers.cookie, 'bwx_session'), { secret: s });
  return p?.sub ?? null;
}
export const q = (v) => encodeURIComponent(String(v));
export async function rows(r) {
  if (!r.ok) throw Object.assign(new Error(`database ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 });
  return r.status === 204 ? [] : r.json();
}
export const fail = (res, e) => res.status(e.status || 500).json({ error: e.message || 'Something went wrong.' });
