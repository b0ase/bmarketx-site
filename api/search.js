// GET /api/search?q=&page= -> { items, total } across every store
import { db } from './_db.js';
import { fail, q, rows } from './_util.js';

export default async function handler(req, res) {
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1), per = 48;
  let f = `bmx_listings?status=eq.active&select=id,title,price_cents,was_cents,promo,condition,category,images,store_handle`;
  if (req.query.q) f += `&title=ilike.${q('*' + String(req.query.q).replace(/[*,()]/g, ' ') + '*')}`;
  f += `&order=created_at.desc&limit=${per}&offset=${(page - 1) * per}`;
  try {
    const r = await d(f, { headers: { prefer: 'count=exact' } });
    const items = await rows(r);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ items, total: +(r.headers.get('content-range') || '').split('/')[1] || items.length });
  } catch (e) { return fail(res, e); }
}
