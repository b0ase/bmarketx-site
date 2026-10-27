// POST /api/import/csv { handle, displayName, tagline?, items: [...] } -> { handle, imported }
// A seller's eBay listings, read from their CSV in the browser (lib/csv.js), into a store they own. Up to 500 items
// per call; the page sends batches. A CSV store is unverified until the eBay store is proved (claim.js), and a proved
// eBay owner takes the handle if they share it.
import { db } from '../_db.js';
import { body, fail, originOk, q, rows, toRow, who, limited } from '../_util.js';

const HANDLE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  if (await limited(req, res, 'csv', 120, 600, me)) return;
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const b = await body(req);
  const handle = String(b.handle || '').toLowerCase().trim();
  if (!HANDLE.test(handle)) return res.status(400).json({ error: 'Store address: 2–64 letters, numbers, dots, dashes or underscores.' });
  if (!Array.isArray(b.items) || b.items.length > 500) return res.status(400).json({ error: 'Send up to 500 items at a time.' });
  const name = String(b.displayName || '').trim().slice(0, 80) || handle;

  try {
    const [st] = await rows(await d(`bmx_stores?handle=eq.${q(handle)}&select=owner_key`));
    if (st && st.owner_key !== me) return res.status(409).json({ error: `bmarketx.com/str/${handle} is taken. Pick another address.` });
    if (!st) {
      await rows(await d('bmx_stores', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
        handle, owner_key: me, display_name: name, tagline: String(b.tagline || '').slice(0, 500) || null,
      }) }));
    }
    const list = b.items.map((i) => toRow(handle, { ...i, source: 'ebay-csv' })).filter(Boolean);
    // rows with an eBay item number update in place on a re-upload; rows without one are always added
    const keyed = list.filter((r) => r.ebay_id), loose = list.filter((r) => !r.ebay_id);
    if (keyed.length) await rows(await d('bmx_listings?on_conflict=store_handle,ebay_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(keyed) }));
    if (loose.length) await rows(await d('bmx_listings', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(loose) }));
    return res.status(200).json({ handle, imported: list.length, rejected: b.items.length - list.length });
  } catch (e) { return fail(res, e); }
}
