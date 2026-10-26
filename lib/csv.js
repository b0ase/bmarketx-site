// eBay listing CSVs -> bMarketX items. Runs in the browser (sell page) and in Node. Reads the Seller Hub
// "All active listings" report, the File Exchange / Seller Hub upload template, and most hand-made sheets, by
// matching column names rather than positions.

/** RFC 4180: quoted fields, "" escapes, newlines inside quotes, CRLF or LF. Also takes ; or tab separated. */
export function parseCsv(textIn) {
  const text = String(textIn).replace(/^﻿/, '');
  const first = text.slice(0, text.indexOf('\n') + 1 || text.length);
  const sep = [',', ';', '\t'].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const out = []; let row = [], f = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else quoted = false; } else f += c;
    } else if (c === '"' && f === '') quoted = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); out.push(row); }
  return out.filter((r) => r.some((v) => v.trim() !== ''));
}

// Our field -> header names seen in eBay exports, best first. Matched case-insensitively, ignoring *, spaces and
// anything in brackets after the first word (eBay writes "*Action(SiteID=US|Country=US|...)").
const ALIASES = {
  title: ['title', 'item title', 'listing title', 'name', 'product name'],
  price: ['current price', 'buy it now price', 'auction buy it now price', 'startprice', 'start price', 'price', 'sold for', 'sale price'],
  was: ['start price', 'original price', 'list price', 'strikethrough price', 'was price'],
  quantity: ['available quantity', 'quantity available', 'quantity', 'qty'],
  ebayId: ['item number', 'itemid', 'item id', 'listing id'],
  sku: ['custom label (sku)', 'customlabel', 'custom label', 'sku'],
  condition: ['condition', 'conditionid', 'condition id', 'item condition'],
  category: ['ebay category 1 name', 'store category name', 'category name', 'category'],
  images: ['picurl', 'picture url', 'item photo url', 'image url', 'photo url', 'images', 'image'],
  description: ['description'],
  currency: ['currency'],
  format: ['format'],
};
const norm = (h) => String(h).toLowerCase().replace(/\(siteid.*$/, '').replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();

/** The header row (eBay reports can start with a line or two of notes) and which column holds each field. */
export function mapColumns(rows) {
  const at = rows.findIndex((r) => r.some((h) => ALIASES.title.includes(norm(h))));
  if (at < 0) return null;
  const head = rows[at].map(norm), cols = {};
  for (const [k, names] of Object.entries(ALIASES)) {
    for (const n of names) { const i = head.indexOf(n); if (i >= 0) { cols[k] = i; break; } }
  }
  return cols.title == null || cols.price == null ? { at, head: rows[at], cols, missing: cols.title == null ? 'Title' : 'Price' } : { at, head: rows[at], cols };
}

// eBay ConditionID codes, plus the trading-card ones (2750 graded, 4000 ungraded).
const COND = { 1000: 'New', 1500: 'New other', 1750: 'New with defects', 2000: 'Certified refurbished', 2500: 'Seller refurbished',
  2750: 'Graded', 3000: 'Used', 4000: 'Ungraded', 5000: 'Good', 6000: 'Acceptable', 7000: 'For parts or not working' };
const cents = (s) => {
  const t = String(s || '').replace(/[^\d.,-]/g, '');
  if (!t) return null;
  // "1.234,56" (EU) vs "1,234.56" (US)
  const v = /,\d{2}$/.test(t) && !/\.\d{2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/** -> { items, skipped: [{ line, why }], currencies } */
export function toItems(rows, map) {
  const items = [], skipped = [], currencies = new Set();
  const get = (r, k) => (map.cols[k] == null ? '' : String(r[map.cols[k]] ?? '').trim());
  rows.slice(map.at + 1).forEach((r, k) => {
    const line = map.at + k + 2;
    const title = get(r, 'title');
    if (!title) return skipped.push({ line, why: 'no title' });
    const priceCents = cents(get(r, 'price'));
    if (!priceCents) return skipped.push({ line, why: 'no price' });
    const cur = get(r, 'currency').toUpperCase(); if (cur) currencies.add(cur);
    const c = get(r, 'condition');
    items.push({
      title, priceCents, wasCents: cents(get(r, 'was')), quantity: parseInt(get(r, 'quantity'), 10) || 1,
      ebayId: get(r, 'ebayId').replace(/\D/g, '') || null, sku: get(r, 'sku') || null,
      condition: /^\d{4}$/.test(c) ? COND[c] || null : c || null, category: /^\d+$/.test(get(r, 'category')) ? null : get(r, 'category') || null,
      images: get(r, 'images').split(/[|,\s]+/).filter((u) => /^https:\/\//i.test(u)),
      description: get(r, 'description') || null,
    });
  });
  return { items, skipped, currencies: [...currencies] };
}
