// GET /api/og?claim=<handle> -> 1200×630 PNG share picture for an unclaimed store address:
// "Claim your store." with the store name in the brand gold. Built from brand/og.svg (its headline removed) with the
// text drawn as paths from Space Grotesk 700 (lib/fonts, OFL), so the server needs no installed fonts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = process.cwd();
let base = null, font = null;
const load = () => {
  if (base) return;
  // drop the three headline paths ("Sell anything." / "Paid in seconds." / the line under them); keep logo, mark, URL
  base = readFileSync(join(root, 'brand/og.svg'), 'utf8').replace(/<path d="M(102\.9 286\.4|78\.6 395V325|72\.61 470)[^>]*\/>/g, '');
  const b = readFileSync(join(root, 'lib/fonts/SpaceGrotesk-Bold.ttf'));
  font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
// text as one path, shrunk to fit maxW; letter-spacing -0.03em like the brand art
function line(text, x, y, size, maxW, fill) {
  const track = (s) => font.getAdvanceWidth(text, s, { letterSpacing: -0.03 });
  while (size > 28 && track(size) > maxW) size -= 2;
  return `<path d="${font.getPath(text, x, y, size, { letterSpacing: -0.03 }).toPathData(2)}" fill="${fill}"/>`;
}

export default async function handler(req, res) {
  const h = String(req.query.claim || '').toLowerCase();
  if (!/^[a-z0-9._-]{2,64}$/.test(h)) return res.status(404).end();
  try {
    load();
    const text = line('Claim your store.', 72, 290, 84, 760, '#F1EAD9') + line(h, 72, 392, 92, 760, 'url(#hg)')
      + line('Kept for the eBay seller. Paid in BSV.', 74, 468, 30, 760, '#CFCABD');
    const svg = base.replace('</svg>', `${text}</svg>`);
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    res.setHeader('content-type', 'image/png');
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).send(png);
  } catch (e) { console.error('og', e.message); return res.status(500).end(); }
}
