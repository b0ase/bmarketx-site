// POST /api/feedback { page, rating 1-5, comment?, contact?, withWallet? } -> { ok }
import { db } from './_db.js';
import { body, fail, originOk, rows, who } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  const d = db();
  if (!d) return res.status(503).json({ error: 'Feedback isn’t switched on yet.' });
  const b = await body(req);
  const rating = parseInt(b.rating, 10);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Pick a score from 1 to 5.' });
  try {
    await rows(await d('bmx_feedback', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
      page: String(b.page || '/').slice(0, 120), rating,
      comment: String(b.comment || '').trim().slice(0, 500) || null, contact: String(b.contact || '').trim().slice(0, 100) || null,
      identity_key: b.withWallet ? await who(req) : null,
    }) }));
    return res.status(200).json({ ok: true });
  } catch (e) { return fail(res, e); }
}
