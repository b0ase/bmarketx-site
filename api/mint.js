// POST /api/mint { txid, minted: [{ listingId, vout, iconVout }] } -> { saved }
// Records the tokens a seller's wallet just minted for their own listings. The wallet built, signed and paid for
// the transaction; we only note which outpoint is which listing. Only the store owner can record.
import { db } from './_db.js';
import { body, fail, originOk, q, rows, who, limited } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  if (await limited(req, res, 'mint', 60, 600, me)) return;
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const b = await body(req);
  if (!/^[0-9a-f]{64}$/.test(String(b.txid)) || !Array.isArray(b.minted) || !b.minted.length || b.minted.length > 50) {
    return res.status(400).json({ error: 'Bad mint record.' });
  }
  try {
    const ids = b.minted.map((m) => parseInt(m.listingId, 10)).filter(Boolean);
    const mine = await rows(await d(`bmx_listings?id=in.(${ids.join(',')})&token_id=is.null&select=id,store_handle,bmx_stores!inner(owner_key)&bmx_stores.owner_key=eq.${q(me)}`));
    const ok = new Set(mine.map((r) => r.id));
    let saved = 0;
    for (const m of b.minted) {
      const id = parseInt(m.listingId, 10);
      if (!ok.has(id) || !Number.isInteger(m.vout) || !Number.isInteger(m.iconVout)) continue;
      await rows(await d(`bmx_listings?id=eq.${id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
        token_id: `${b.txid}_${m.vout}`, icon_origin: m.iconVout >= 0 ? `${b.txid}_${m.iconVout}` : null, minted_at: new Date().toISOString(),
      }) }));
      saved++;
    }
    return res.status(200).json({ saved });
  } catch (e) { return fail(res, e); }
}
