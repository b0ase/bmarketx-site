// Reads a public eBay store page (ebay.com/str/<name>) into plain data, so a seller can bring their store to
// bMarketX in one step. Server-side only. eBay's markup changes; every field is optional and the item list is the
// only thing we insist on.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const text = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m,
).replace(/\s+/g, ' ').trim();
const cents = (s) => { const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/); return m ? Math.round(+m[1] * 100) : null; };
export const big = (url) => url && url.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)/i, '/s-l1600.$1');

/** "https://www.ebay.com/str/moistycollectibles?x" or "moistycollectibles" -> "moistycollectibles" */
export function storeName(input) {
  const s = String(input || '').trim();
  const m = s.match(/ebay\.[a-z.]+\/str\/([A-Za-z0-9._-]+)/i);
  const n = m ? m[1] : s;
  return /^[A-Za-z0-9._-]{2,64}$/.test(n) ? n.toLowerCase() : null;
}

export function parseStore(html, name) {
  const meta = (p) => text((html.match(new RegExp(`<meta (?:name|Property)="${p}" (?:content|Content)="([^"]*)"`, 'i')) || [])[1]);
  const stat = (label) => (html.match(new RegExp(`BOLD">([\\d.,%]+)</span><!--F#@1-->\\s*${label}`)) || [])[1] || null;
  const displayName = text((html.match(/"displayName":\{"_type":"TextualDisplay","textSpans":\[\{"_type":"TextSpan","text":"([^"]+)"/) || [])[1])
    || meta('twitter:title').split(' | ')[0] || name;
  const total = +((html.match(/Search all ([\d,]+) items/) || [])[1] || '0').replace(/,/g, '');
  const pages = Math.max(1, ...[...html.matchAll(/_pgn=(\d+)/g)].map((m) => +m[1]));

  const categories = [];
  for (const m of html.matchAll(/str-categories__single--option aria-label="([^"]+)"[^>]*>|href=(\S+store_cat=(\d+)) class=str-categories__single--option aria-label="([^"]+)"/g)) {
    const label = text(m[4] || m[1]);
    if (label && !categories.some((c) => c.label === label)) categories.push({ label, id: m[3] || null });
  }

  const items = html.split('<article data-testid=ig-').slice(1).map((a) => {
    const id = (a.match(/^(\d{6,})/) || [])[1];
    const title = text((a.match(/str-item-card__property-title[^>]*><span[^>]*>([^<]+)</) || [])[1]);
    if (!id || !title) return null;
    const price = cents((a.match(/property-displayPrice">([^<]+)</) || [])[1]);
    const was = cents((a.match(/STRIKETHROUGH">([^<]+)</) || [])[1]);
    const promo = text((a.match(/NEGATIVE BOLD">([^<]+)</) || [])[1]) || null;
    const img = (a.match(/src=(https:\/\/i\.ebayimg\.com\/images\/g\/[^\s>]+)/) || [])[1];
    return { ebayId: id, title, priceCents: price, wasCents: was && was !== price ? was : null, promo, image: big(img), condition: condition(title) };
  }).filter(Boolean);

  return {
    name, displayName, tagline: meta('description') || null,
    logo: big(meta('twitter:image')) || null,
    feedback: stat('positive feedback'), sold: stat('items sold'), followers: stat('followers'),
    total, pages, categories: categories.slice(0, 24), items,
  };
}

// Card-trade grading shorthand eBay sellers put in titles, mapped to eBay's own condition words.
export function condition(title) {
  const t = ` ${title} `;
  if (/\b(Very Mint|Gem Mint|NM|Near Mint)\b/i.test(t)) return 'Near mint or better';
  if (/\bLP\b|Lightly Played/i.test(t)) return 'Lightly played';
  if (/\bMP\b|Moderately Played/i.test(t)) return 'Moderately played';
  if (/\bHP\b|Heavily Played/i.test(t)) return 'Heavily played';
  if (/\b(Damaged|DMG)\b/i.test(t)) return 'Damaged';
  if (/\b(New|Sealed)\b/i.test(t)) return 'New';
  return 'Used';
}

export async function fetchStore(name, page = 1) {
  const url = `https://www.ebay.com/str/${encodeURIComponent(name)}?_pgn=${page}&rt=nc`;
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' }, redirect: 'follow' });
  if (r.status === 404) throw Object.assign(new Error('No eBay store with that name.'), { status: 404 });
  if (r.status === 403 || r.status === 429) throw Object.assign(new Error('eBay isn’t letting us read store pages right now. Upload your listings CSV instead; Sign in with eBay is coming soon.'), { status: 503 });
  if (!r.ok) throw Object.assign(new Error(`eBay answered ${r.status}. Try again in a minute.`), { status: 502 });
  const s = parseStore(await r.text(), name);
  if (!s.items.length && page === 1) throw Object.assign(new Error('That store page had no listings we could read.'), { status: 422 });
  return s;
}
