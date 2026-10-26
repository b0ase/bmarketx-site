// The move from eBay by store link, for the signed-in wallet.
// POST { store }                 -> { handle, code, verified }  the proof code for this wallet + store
// POST { store, verify: true }   -> { verified }                checks the code is in the eBay store description
// POST { store, page }           -> { imported }                copies one page of listings (verified owner only)
// The code is an HMAC of (store, wallet), so nothing is stored until the proof succeeds. A proved eBay owner wins
// the handle: an unverified store (a CSV upload) sitting on it is moved to <handle>-<n>.
import { createHmac, randomBytes } from 'node:crypto';
import { fetchStore, storeName } from '../../lib/ebay.js';
import { db } from '../_db.js';
import { secret } from '../bwalletx/_auth.js';
import { body, fail, originOk, q, rows, toRow, who } from '../_util.js';

const codeFor = (name, me) => 'bmx-' + createHmac('sha256', secret()).update(`ebay-proof\n${name}\n${me}`).digest('hex').slice(0, 6);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const b = await body(req);
  const name = storeName(b.store);
  if (!name) return res.status(400).json({ error: 'Paste your eBay store link, like ebay.com/str/yourstore.' });
  const code = codeFor(name, me);

  try {
    const [proved] = await rows(await d(`bmx_stores?ebay_name=eq.${q(name)}&select=handle,owner_key`));
    if (proved && proved.owner_key !== me) return res.status(409).json({ error: 'This eBay store has already moved to another wallet. If it is yours, contact us.' });

    if (!proved && !b.verify) return res.status(200).json({ handle: name, code, verified: false });

    if (!proved) {
      const s = await fetchStore(name, 1);
      if (!String(s.tagline || '').includes(code)) {
        return res.status(200).json({ handle: name, code, verified: false, error: `We couldn't see ${code} in your eBay store description yet. eBay can take a few minutes to update.` });
      }
      const [sitting] = await rows(await d(`bmx_stores?handle=eq.${q(name)}&select=handle,owner_key,ebay_name`));
      const stats = { ebay_name: name, ebay_feedback: s.feedback, ebay_sold: s.sold, ebay_followers: s.followers, verified_at: new Date().toISOString() };
      if (sitting && sitting.owner_key !== me) {
        const moved = `${name.slice(0, 56)}-${randomBytes(2).toString('hex')}`;
        await rows(await d(`bmx_stores?handle=eq.${q(name)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ handle: moved }) }));
      }
      if (sitting && sitting.owner_key === me) {
        await rows(await d(`bmx_stores?handle=eq.${q(name)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(stats) }));
      } else {
        await rows(await d('bmx_stores', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
          handle: name, owner_key: me, display_name: s.displayName, tagline: s.tagline?.replace(code, '').trim() || null, logo: s.logo, ...stats,
        }) }));
      }
      return res.status(200).json({ handle: name, verified: true, pages: s.pages, total: s.total });
    }

    const page = Math.min(Math.max(parseInt(b.page, 10) || 1, 1), 200);
    const s = await fetchStore(name, page);
    const list = s.items.map((i) => toRow(proved.handle, { ...i, source: 'ebay-page' })).filter(Boolean);
    if (list.length) {
      await rows(await d('bmx_listings?on_conflict=store_handle,ebay_id', {
        method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(list),
      }));
    }
    return res.status(200).json({ handle: proved.handle, verified: true, page, pages: s.pages, imported: list.length });
  } catch (e) { return fail(res, e); }
}
