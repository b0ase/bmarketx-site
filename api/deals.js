// GET /api/deals?q= -> { items } listings a seller has marked down (was_cents > price), biggest % off first
import { db } from './_db.js';
import { fail, q, rows } from './_util.js';

export default async function handler(req, res) {
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  let f = 'bmx_listings?status=eq.active&was_cents=not.is.null&select=id,title,price_cents,was_cents,promo,condition,images,category,store_handle&order=created_at.desc&limit=400';
  if (req.query.q) f += `&title=ilike.${q('*' + String(req.query.q).replace(/[*,()]/g, ' ') + '*')}`;
  try {
    const items = (await rows(await d(f))).filter((i) => i.was_cents > i.price_cents)
      .map((i) => ({ ...i, pct: Math.round((1 - i.price_cents / i.was_cents) * 100) }))
      .sort((a, b) => b.pct - a.pct).slice(0, 96);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ items });
  } catch (e) { return fail(res, e); }
}
