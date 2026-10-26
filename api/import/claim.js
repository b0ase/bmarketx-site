// The move from eBay, for the signed-in wallet.
// POST { store }                 -> { handle, code }  claims the store and hands out a proof code
// POST { store, verify: true }   -> { verified }      checks the code is in the eBay store description
// POST { store, page }           -> { imported }      copies one page of listings (verified stores only)
import { randomBytes } from 'node:crypto';
import { fetchStore, storeName } from '../../lib/ebay.js';
import { db } from '../_db.js';
import { body, fail, q, rows, who } from '../_util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const b = await body(req);
  const name = storeName(b.store);
  if (!name) return res.status(400).json({ error: 'Paste your eBay store link, like ebay.com/str/yourstore.' });

  try {
    const [st] = await rows(await d(`bmx_stores?handle=eq.${q(name)}&select=*`));
    if (st && st.owner_key !== me) return res.status(409).json({ error: 'Someone else is moving this store. If it is yours, contact us.' });

    if (!st) {
      const s = await fetchStore(name, 1);
      const code = 'bmx-' + randomBytes(3).toString('hex');
      await rows(await d('bmx_stores', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
        handle: name, owner_key: me, display_name: s.displayName, tagline: s.tagline, logo: s.logo,
        ebay_feedback: s.feedback, ebay_sold: s.sold, ebay_followers: s.followers, verify_code: code,
      }) }));
      return res.status(200).json({ handle: name, code, verified: false });
    }

    if (!st.verified_at && !b.verify) return res.status(200).json({ handle: name, code: st.verify_code, verified: false });

    if (!st.verified_at) {
      const s = await fetchStore(name, 1);
      if (!String(s.tagline || '').includes(st.verify_code)) {
        return res.status(200).json({ handle: name, code: st.verify_code, verified: false, error: `We couldn't see ${st.verify_code} in your eBay store description yet. eBay can take a few minutes to update.` });
      }
      await rows(await d(`bmx_stores?handle=eq.${q(name)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
        verified_at: new Date().toISOString(), ebay_name: name, ebay_feedback: s.feedback, ebay_sold: s.sold, ebay_followers: s.followers,
      }) }));
      return res.status(200).json({ handle: name, verified: true, pages: s.pages, total: s.total });
    }

    const page = Math.min(Math.max(parseInt(b.page, 10) || 1, 1), 200);
    const s = await fetchStore(name, page);
    const list = s.items.filter((i) => i.priceCents).map((i) => ({
      store_handle: name, ebay_id: i.ebayId, title: i.title.slice(0, 80), price_cents: i.priceCents, was_cents: i.wasCents,
      promo: i.promo, condition: i.condition, images: i.image ? [i.image] : [], status: 'active',
    }));
    if (list.length) {
      await rows(await d('bmx_listings?on_conflict=store_handle,ebay_id', {
        method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(list),
      }));
    }
    return res.status(200).json({ handle: name, verified: true, page, pages: s.pages, imported: list.length });
  } catch (e) { return fail(res, e); }
}
