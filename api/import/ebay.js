// GET /api/import/ebay?store=<url or name>&page=1 -> a preview of the eBay store. Nothing is saved.
import { fetchStore, storeName } from '../../lib/ebay.js';
import { fail } from '../_util.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const name = storeName(req.query.store);
  if (!name) return res.status(400).json({ error: 'Paste your eBay store link, like ebay.com/str/yourstore.' });
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 200);
  try {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(await fetchStore(name, page));
  } catch (e) { return fail(res, e); }
}
