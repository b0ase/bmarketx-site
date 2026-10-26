// GET /api/import/ebay?store=<url or name>&page=1 -> a preview of the eBay store. Nothing is saved.
import { fetchStore, storeName } from '../../lib/ebay.js';
import { fail, who } from '../_util.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  // signed-in sellers only, so the endpoint can't be used as an anonymous eBay scraper
  if (!(await who(req))) return res.status(401).json({ error: 'Connect bWalletX first, then paste your store link.' });
  const name = storeName(req.query.store);
  if (!name) return res.status(400).json({ error: 'Paste your eBay store link, like ebay.com/str/yourstore.' });
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 200);
  try {
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(await fetchStore(name, page));
  } catch (e) { return fail(res, e); }
}
