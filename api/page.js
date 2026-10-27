// GET /api/page?kind=itm&id=<n> | ?kind=str&handle=<h>  (behind the /itm/:id and /str/:handle rewrites)
// Serves itm.html / str.html with the real title, description and photo in the <head>, so links shared on X,
// WhatsApp, iMessage and search engines show the listing or store instead of "Item · bMarketX". The page's own
// script still renders everything else in the browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './_db.js';
import { q, rows } from './_util.js';

const files = {};
const page = (k) => (files[k] ||= readFileSync(join(process.cwd(), `${k}.html`), 'utf8'));
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = (c) => '$' + (c / 100).toFixed(2);
const photo = (u) => (u || '').replace(/\/s-l\d+\.(jpg|jpeg|png|webp)$/i, '/s-l1200.jpg');

function head(html, { title, desc, image, url }) {
  const tags = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="bMarketX">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">`;
  return html
    .replace(/<title>[^<]*<\/title>\s*/, '')
    .replace(/<meta (name="description"|property="og:(title|description|image)"|name="twitter:card")[^>]*>\s*/g, '')
    .replace('<meta name="viewport" content="width=device-width, initial-scale=1">', (m) => `${m}\n${tags}`);
}

export default async function handler(req, res) {
  const kind = req.query.kind === 'str' ? 'str' : 'itm';
  // a ?v=N on a shared link makes X / WhatsApp fetch a fresh card; keep it in og:url so they don't fall back to the old one
  const v = /^[\w-]{1,12}$/.test(String(req.query.v || '')) ? `?v=${req.query.v}` : '';
  let html = page(kind);
  const d = db();
  try {
    if (d && kind === 'itm') {
      const id = parseInt(req.query.id, 10);
      const [i] = id ? await rows(await d(`bmx_listings?id=eq.${id}&select=id,title,price_cents,condition,images,store_handle`)) : [];
      if (i) html = head(html, { title: `${i.title} | bMarketX`, url: `https://bmarketx.com/itm/${i.id}`,
        desc: `${usd(i.price_cents)} · ${i.condition || 'Used'} · from ${i.store_handle}. Paid in BSV straight to the seller with bWalletX.`,
        image: photo(i.images?.[0]) || 'https://bmarketx.com/brand/og.png' });
    }
    if (d && kind === 'str') {
      const h = String(req.query.handle || '').toLowerCase();
      const [s] = /^[a-z0-9._-]{2,64}$/.test(h) ? await rows(await d(`bmx_stores?handle=eq.${q(h)}&select=handle,display_name,tagline,logo,verified_at`)) : [];
      if (s) html = head(html, { title: `${s.display_name} | bMarketX`, url: `https://bmarketx.com/str/${s.handle}`,
        desc: s.tagline || `${s.display_name}${s.verified_at ? ', a verified eBay seller,' : ''} on bMarketX. Paid in BSV straight to the seller with bWalletX.`,
        image: s.logo || 'https://bmarketx.com/brand/og.png' });
      // unclaimed: the name from the address only, nothing from the eBay store
      else if (/^[a-z0-9._-]{2,64}$/.test(h)) html = head(html, { title: `${h} on bMarketX: claim your store`, url: `https://bmarketx.com/str/${h}${v}`,
        desc: `bmarketx.com/str/${h} is kept for the eBay seller ${h}. Move your store in about a minute and get paid in BSV straight to your wallet.`,
        image: `https://bmarketx.com/api/og?claim=${encodeURIComponent(h)}${v ? '&' + v.slice(1) : ''}` });
    }
  } catch { /* the plain page still works */ }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
  return res.status(200).send(html);
}
