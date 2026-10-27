// POST /api/ebay/import { page } -> { handle, page, pages, total, imported }
// One page (200) of the verified seller's active eBay listings into their bMarketX store, using the eBay token sealed
// in the bmx_ebay_t cookie by the callback. Re-running updates listings in place by eBay item number.
import { open, secret } from '../bwalletx/_auth.js';
import { db } from '../_db.js';
import { fail, originOk, q, rows, toRow, who, body } from '../_util.js';
import { activeListings } from '../../lib/ebay-api.js';

const cookie = (h, k) => (String(h || '').match(new RegExp(`(?:^|;\\s*)${k}=([^;]+)`)) || [])[1];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  const s = open(secret(), cookie(req.headers.cookie, 'bmx_ebay_t'));
  if (!s || s.me !== me || s.exp < Date.now()) return res.status(401).json({ error: 'Sign in with eBay again to bring your listings.', ebay: true });
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const page = Math.min(Math.max(parseInt((await body(req)).page, 10) || 1, 1), 100);
  try {
    const [st] = await rows(await d(`bmx_stores?handle=eq.${q(s.handle)}&owner_key=eq.${q(me)}&select=handle`));
    if (!st) return res.status(403).json({ error: 'That store isn’t yours.' });
    const r = await activeListings(s.t, page);
    const list = r.items.map((i) => toRow(st.handle, { ...i, source: 'ebay-page' })).filter(Boolean);
    if (list.length) await rows(await d('bmx_listings?on_conflict=store_handle,ebay_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(list) }));
    return res.status(200).json({ handle: st.handle, page, pages: r.pages, total: r.total, imported: list.length });
  } catch (e) { return fail(res, e); }
}
