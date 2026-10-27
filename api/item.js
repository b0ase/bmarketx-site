// GET /api/item?id=<n> -> { item, store }
import { db } from './_db.js';
import { fail, q, rows } from './_util.js';

export default async function handler(req, res) {
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: 'Bad item number.' });
  try {
    const [item] = await rows(await d(`bmx_listings?id=eq.${id}&select=*`));
    if (!item) return res.status(404).json({ error: 'That item is gone.' });
    const [store] = await rows(await d(`bmx_stores?handle=eq.${q(item.store_handle)}&select=handle,display_name,logo,contact,ebay_feedback,ebay_sold,ebay_followers`));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ item, store });
  } catch (e) { return fail(res, e); }
}
