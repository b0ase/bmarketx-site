// GET /api/square?id=<listing> -> 1080×1080 JPEG (≤400 KB): the listing's photo as a bAds square, for Promote.
// The photo is centred on white (cards and goods are rarely square) with the bMarketX logo in a band at the foot.
// The logo is paths only, so no fonts are needed on the server.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { db } from './_db.js';
import { rows } from './_util.js';

const S = 1080, BAND = 120;
let logo = null;
const logoPng = async () => (logo ||= await sharp(readFileSync(join(process.cwd(), 'brand/logo.svg')), { density: 300 }).resize({ height: 64 }).png().toBuffer());

export default async function handler(req, res) {
  const d = db();
  const id = parseInt(req.query.id, 10);
  if (!d || !id) return res.status(404).end();
  try {
    const [l] = await rows(await d(`bmx_listings?id=eq.${id}&status=eq.active&select=images`));
    const src = l?.images?.[0]?.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)$/i, '/s-l1600.jpg');
    if (!src || !/^https:\/\/i\.ebayimg\.com\//.test(src) && !/^https:\/\//.test(src)) return res.status(404).end();
    const r = await fetch(src);
    if (!r.ok) return res.status(404).end();
    const photo = await sharp(Buffer.from(await r.arrayBuffer())).resize(S - 80, S - BAND - 60, { fit: 'inside' }).toBuffer();
    const meta = await sharp(photo).metadata();
    const lg = await logoPng(), lm = await sharp(lg).metadata();
    let q = 86, out;
    do {
      out = await sharp({ create: { width: S, height: S, channels: 3, background: '#ffffff' } })
        .composite([
          { input: photo, left: Math.round((S - meta.width) / 2), top: Math.round((S - BAND - meta.height) / 2) + 10 },
          { input: { create: { width: S, height: BAND, channels: 3, background: '#f7f7f7' } }, left: 0, top: S - BAND },
          { input: lg, left: Math.round((S - lm.width) / 2), top: S - BAND + Math.round((BAND - lm.height) / 2) },
        ])
        .jpeg({ quality: q, mozjpeg: true }).toBuffer();
      q -= 8;
    } while (out.length > 400_000 && q > 40);
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).send(out);
  } catch (e) { console.error('square', e.message); return res.status(500).end(); }
}
