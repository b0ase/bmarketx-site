// POST /api/event { event, campaign?, source?, medium?, page?, n?, cents? } -> 204   (see /privacy)
// GET  /api/event?days=30 -> counts by day, event and campaign, for the owner's wallets only (STATS_KEYS, comma list)
// Counts what happened and which campaign brought the visit. No IP, wallet key, name or address is stored.
import { db } from './_db.js';
import { body, fail, limited, originOk, rows, who } from './_util.js';

const EVENTS = new Set(['visit', 'wallet_connected', 'store_opened', 'listings_imported', 'checkout_started', 'purchase', 'promote_paid']);
const clip = (v, n) => { const s = String(v ?? '').replace(/[^\w.:$@/ -]/g, '').trim().slice(0, n); return s || null; };
const int = (v, max) => { const x = Math.round(+v); return Number.isFinite(x) && x >= 0 && x <= max ? x : null; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const d = db();
  if (!d) return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const me = await who(req);
      const owners = String(process.env.STATS_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
      if (!me || !owners.includes(me)) return res.status(403).json({ error: 'Stats are for the bMarketX team.' });
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const list = await rows(await d(`bmx_events?at=gte.${since}&select=at,event,campaign,source,n,cents&order=at.desc&limit=50000`));
      return res.status(200).json({ days, events: list });
    }
    if (req.method !== 'POST') return res.status(405).end();
    if (!originOk(req.headers.origin)) return res.status(403).end();
    if (await limited(req, res, 'event', 120, 600)) return;
    const b = await body(req);
    if (!EVENTS.has(b.event)) return res.status(400).end();
    await rows(await d('bmx_events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
      event: b.event, campaign: clip(b.campaign, 80), source: clip(b.source, 80), medium: clip(b.medium, 40),
      page: clip(String(b.page || '').split('?')[0], 120), n: int(b.n, 100000), cents: int(b.cents, 100000000),
    }) }));
    return res.status(204).end();
  } catch (e) { return fail(res, e); }
}
