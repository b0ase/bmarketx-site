// GET /api/store?handle=<h>&q=&sort=&page= -> { store, items, total }
import { db } from './_db.js';
import { fail, q, rows } from './_util.js';

const SORT = { best: 'created_at.desc', low: 'price_cents.asc', high: 'price_cents.desc', new: 'created_at.desc' };
export default async function handler(req, res) {
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const h = String(req.query.handle || '').toLowerCase();
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1), per = 48;
  try {
    const [store] = await rows(await d(`bmx_stores?handle=eq.${q(h)}&verified_at=not.is.null&select=handle,display_name,tagline,logo,ebay_name,ebay_feedback,ebay_sold,ebay_followers,created_at`));
    if (!store) return res.status(404).json({ error: 'No store here yet.' });
    let f = `bmx_listings?store_handle=eq.${q(h)}&status=eq.active&select=id,title,price_cents,was_cents,promo,condition,images`;
    if (req.query.q) f += `&title=ilike.${q('*' + String(req.query.q).replace(/[*,()]/g, ' ') + '*')}`;
    f += `&order=${SORT[req.query.sort] || SORT.best}&limit=${per}&offset=${(page - 1) * per}`;
    const r = await d(f, { headers: { prefer: 'count=exact' } });
    const items = await rows(r);
    const total = +(r.headers.get('content-range') || '').split('/')[1] || items.length;
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ store, items, total, page, pages: Math.max(1, Math.ceil(total / per)) });
  } catch (e) { return fail(res, e); }
}
