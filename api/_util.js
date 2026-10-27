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
  if (!r.ok) {
    console.error('database', r.status, (await r.text()).slice(0, 500));   // details stay in the server log
    throw Object.assign(new Error('The market database had a problem. Try again in a minute.'), { status: 502 });
  }
  const t = await r.text();   // 201/204 with return=minimal come back empty
  return t ? JSON.parse(t) : [];
}
export const fail = (res, e) => {
  if (!e.status) console.error(e);
  return res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong. Try again.' });
};
/** State-changing calls must come from our own pages (on top of the SameSite cookie). */
export { originOk } from './bwalletx/_auth.js';

const clip = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const HTTPS_IMG = /^https:\/\/[^\s"'<>]+$/i;
/** One listing as a bmx_listings row, checked and trimmed. Anything a browser sends goes through here. */
export function toRow(handle, i) {
  const price = Math.round(+i.priceCents);
  const title = String(i.title || '').replace(/\s+/g, ' ').trim();
  if (!title || !(price > 0) || price > 100_000_000) return null;
  const images = (Array.isArray(i.images) ? i.images : i.image ? [i.image] : []).filter((u) => HTTPS_IMG.test(u)).slice(0, 12);
  const was = Math.round(+i.wasCents) || null;
  return {
    store_handle: handle, title: title.slice(0, 80), price_cents: price, was_cents: was && was > price ? was : null,
    promo: clip(i.promo, 80), condition: clip(i.condition, 60), category: clip(i.category, 120), description: clip(i.description, 8000),
    images, quantity: Math.max(0, Math.min(99999, parseInt(i.quantity, 10) || 1)), ebay_id: clip(i.ebayId, 32), sku: clip(i.sku, 80),
    ship_cents: i.shipCents === '' || i.shipCents == null ? null : Math.max(0, Math.min(100000, Math.round(+i.shipCents) || 0)),
    source: ['ebay-page', 'bmarketx'].includes(i.source) ? i.source : 'ebay-csv', status: 'active',
  };
}
