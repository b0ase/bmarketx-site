// POST /api/store-save { handle, displayName, tagline? } -> { handle }
// Opens a new store for the signed-in wallet, or updates the name and about text of one it owns.
import { db } from './_db.js';
import { body, fail, originOk, q, rows, who } from './_util.js';

const HANDLE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const b = await body(req);
  const handle = String(b.handle || '').toLowerCase().trim();
  const name = String(b.displayName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const tagline = String(b.tagline || '').trim().slice(0, 500) || null;
  if (!HANDLE.test(handle)) return res.status(400).json({ error: 'Store address: 2–64 letters, numbers, dots, dashes or underscores.' });
  if (!name) return res.status(400).json({ error: 'Give your store a name.' });
  try {
    const [st] = await rows(await d(`bmx_stores?handle=eq.${q(handle)}&select=owner_key`));
    if (st && st.owner_key !== me) return res.status(409).json({ error: `bmarketx.com/str/${handle} is taken. Pick another address.` });
    if (st) {
      await rows(await d(`bmx_stores?handle=eq.${q(handle)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ display_name: name, tagline }) }));
    } else {
      await rows(await d('bmx_stores', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ handle, owner_key: me, display_name: name, tagline }) }));
    }
    return res.status(200).json({ handle });
  } catch (e) { return fail(res, e); }
}
