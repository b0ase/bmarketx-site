// POST /api/listing-save { store, title, priceCents, wasCents?, quantity, condition, category?, description?, images: [https…] }
// -> { id }  A new listing in a store the signed-in wallet owns.
import { db } from './_db.js';
import { body, fail, originOk, q, rows, toRow, who } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const b = await body(req);
  try {
    const [st] = await rows(await d(`bmx_stores?handle=eq.${q(String(b.store || ''))}&owner_key=eq.${q(me)}&select=handle`));
    if (!st) return res.status(403).json({ error: 'That isn’t one of your stores.' });
    const row = toRow(st.handle, { ...b, ebayId: null, sku: null, source: 'bmarketx' });
    if (!row) return res.status(400).json({ error: 'A listing needs a title and a price.' });
    row.source = 'bmarketx';
    const [made] = await rows(await d('bmx_listings?select=id', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) }));
    return res.status(200).json({ id: made.id });
  } catch (e) { return fail(res, e); }
}
