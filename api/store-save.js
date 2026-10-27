// POST /api/store-save { handle, displayName, tagline?, contact? } -> { handle }
// Opens a new store for the signed-in wallet, or updates the name and about text of one it owns.
import { db } from './_db.js';
import { body, fail, originOk, q, rows, who, limited } from './_util.js';

const HANDLE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  if (await limited(req, res, 'store', 30, 600, me)) return;
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  const b = await body(req);
  const handle = String(b.handle || '').toLowerCase().trim();
  const name = String(b.displayName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const tagline = String(b.tagline || '').trim().slice(0, 500) || null;
  // a bWalletX $handle or a paymail, for buyers' bMail
  const contact = String(b.contact || '').trim().toLowerCase() || null;
  if (contact && !/^(\$[a-z0-9._-]{1,40}|[a-z0-9._-]{1,64}@[a-z0-9.-]+\.[a-z]{2,})$/.test(contact)) return res.status(400).json({ error: 'Messages: use your bWalletX $handle or paymail, like $mabel or mabel@bwalletx.com.' });
  const ship = Math.max(0, Math.min(100000, Math.round(+b.shipCents) || 0));   // default postage, in cents
  if (!HANDLE.test(handle)) return res.status(400).json({ error: 'Store address: 2–64 letters, numbers, dots, dashes or underscores.' });
  if (!name) return res.status(400).json({ error: 'Give your store a name.' });
  try {
    const [st] = await rows(await d(`bmx_stores?handle=eq.${q(handle)}&select=owner_key`));
    if (st && st.owner_key !== me) return res.status(409).json({ error: `bmarketx.com/str/${handle} is taken. Pick another address.` });
    if (st) {
      await rows(await d(`bmx_stores?handle=eq.${q(handle)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ display_name: name, tagline, contact, ship_cents: ship }) }));
    } else {
      await rows(await d('bmx_stores', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ handle, owner_key: me, display_name: name, tagline, contact, ship_cents: ship }) }));
    }
    return res.status(200).json({ handle });
  } catch (e) { return fail(res, e); }
}
