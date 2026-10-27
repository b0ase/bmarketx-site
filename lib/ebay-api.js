// eBay's official APIs, with the seller's own OAuth token (Sign in with eBay). Server-side only.
// Trading API: GetUser (feedback) and GetMyeBaySelling (the seller's active listings, 200 a page).
import { big, condition } from './ebay.js';

const TRADING = 'https://api.ebay.com/ws/api.dll';
const tag = (x, t) => (x.match(new RegExp(`<${t}(?: [^>]*)?>([\\s\\S]*?)</${t}>`)) || [])[1];
const all = (x, t) => [...x.matchAll(new RegExp(`<${t}(?: [^>]*)?>([\\s\\S]*?)</${t}>`, 'g'))].map((m) => m[1]);
const unxml = (s) => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

async function trading(call, token, inner) {
  const r = await fetch(TRADING, {
    method: 'POST',
    headers: { 'content-type': 'text/xml', 'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': token },
    body: `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">${inner}</${call}Request>`,
  });
  const x = await r.text();
  if (!r.ok || tag(x, 'Ack') === 'Failure') {
    console.error('ebay', call, r.status, unxml(tag(x, 'LongMessage') || tag(x, 'ShortMessage')).slice(0, 200));
    throw Object.assign(new Error('eBay didn’t send your listings. Try again in a minute.'), { status: 502 });
  }
  return x;
}

/** The signed-in seller's feedback, e.g. { score: '1234', positive: '99.8%' }. */
export async function feedback(token) {
  const u = tag(await trading('GetUser', token, ''), 'User') || '';
  const pct = tag(u, 'PositiveFeedbackPercent');
  return { score: tag(u, 'FeedbackScore') || null, positive: pct ? `${pct}%` : null };
}

// eBay prices come in the listing's own currency; bMarketX prices are US dollars.
let fx = null;
async function usdPer(cur) {
  if (cur === 'USD') return 1;
  if (!fx || fx.at < Date.now() - 3600_000) {
    const j = await fetch('https://open.er-api.com/v6/latest/USD').then((r) => r.json()).catch(() => null);
    if (!j?.rates) throw Object.assign(new Error('Couldn’t get exchange rates for your prices. Try again in a minute.'), { status: 503 });
    fx = { at: Date.now(), rates: j.rates };
  }
  const per = fx.rates[cur];
  if (!per) throw Object.assign(new Error(`bMarketX can’t price ${cur} listings yet.`), { status: 422 });
  return 1 / per;   // USD for one unit of `cur`
}

/** One page of the seller's active listings as listing objects for toRow(). */
export async function activeListings(token, page) {
  const x = await trading('GetMyeBaySelling', token,
    `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList><DetailLevel>ReturnAll</DetailLevel>`);
  const list = tag(x, 'ActiveList') || '';
  const pages = +tag(tag(list, 'PaginationResult') || '', 'TotalNumberOfPages') || 1;
  const total = +tag(tag(list, 'PaginationResult') || '', 'TotalNumberOfEntries') || 0;
  const items = [];
  for (const it of all(tag(list, 'ItemArray') || '', 'Item')) {
    const priceTag = (it.match(/<BuyItNowPrice currencyID="([A-Z]{3})">([\d.]+)</) || it.match(/<CurrentPrice currencyID="([A-Z]{3})">([\d.]+)</));
    if (!priceTag || !(+priceTag[2] > 0)) continue;
    const title = unxml(tag(it, 'Title'));
    items.push({
      ebayId: tag(it, 'ItemID'), title, priceCents: Math.round(+priceTag[2] * (await usdPer(priceTag[1])) * 100),
      quantity: tag(it, 'QuantityAvailable') ?? tag(it, 'Quantity') ?? 1, sku: unxml(tag(it, 'SKU')) || null,
      image: big(unxml(tag(tag(it, 'PictureDetails') || '', 'GalleryURL'))) || null,
      condition: unxml(tag(it, 'ConditionDisplayName')) || condition(title),
    });
  }
  return { page, pages, total, items };
}
