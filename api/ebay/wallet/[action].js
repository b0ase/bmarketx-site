// eBay account linking for bWalletX ("Link your accounts"), on bMarketX's eBay app. Contract: bWalletX
// src/mobile/social/ebayLink.ts. No bMarketX session is involved, nothing is written to the database and the eBay
// token is used once in the callback and dropped; the wallet keeps the link, signed by its own key.
//   GET  /api/ebay/wallet/status                                   -> { ebay }
//   POST /api/ebay/wallet/start   { provider:'ebay', verifier_hash, return_to? } -> { authorizeUrl }
//   POST /api/ebay/wallet/preview { ticket, secret }               -> { provider, id, name, display, alias }
//   POST /api/ebay/wallet/link                                     -> 501 (no public copy kept; links stay on device)
// The wallet holds a random secret and sends only its sha256 (verifier_hash); the ticket from the callback is useless
// without that secret, so a ticket seen in a URL or history can't be redeemed by anyone else.
import { createHash, randomBytes } from 'node:crypto';
import { open, seal, secret } from '../../bwalletx/_auth.js';
import { body, limited } from '../../_util.js';
import { SCOPES } from '../start.js';

const env = (k) => String(process.env[k] || '').trim();
const ON = () => !!(env('EBAY_CLIENT_ID') && env('EBAY_CLIENT_SECRET') && env('EBAY_RUNAME') && secret());
// the wallet's own origins: web, beta and desktop, the app (Capacitor) and the Chrome extension
const ORIGINS = /^(https:\/\/(web|beta|desktop)\.bwalletx\.com|https:\/\/www\.bwallet\.space|capacitor:\/\/localhost|https:\/\/localhost|chrome-extension:\/\/[a-p]{32})$/;
export const RETURNS = { web: 'https://web.bwalletx.com/', beta: 'https://beta.bwalletx.com/', desktop: 'https://desktop.bwalletx.com/' };

export default async function handler(req, res) {
  const o = String(req.headers.origin || '');
  if (ORIGINS.test(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const a = req.query.action;

  if (a === 'status') return res.status(200).json({ ebay: ON() });
  if (req.method !== 'POST') return res.status(405).end();
  if (!ON()) return res.status(503).json({ error: 'eBay linking is not switched on.' });
  const b = await body(req);

  if (a === 'start') {
    if (await limited(req, res, 'ebaywallet', 30, 600)) return;
    const vh = String(b.verifier_hash || '').toLowerCase();
    if (b.provider !== 'ebay' || !/^[0-9a-f]{64}$/.test(vh)) return res.status(400).json({ error: 'Bad request.' });
    const ret = Object.hasOwn(RETURNS, b.return_to) ? b.return_to : null;
    const state = seal(secret(), { wallet: 1, vh, ret, n: randomBytes(8).toString('base64url'), exp: Date.now() + 10 * 60_000 });
    const u = new URL('https://auth.ebay.com/oauth2/authorize');
    u.search = new URLSearchParams({ client_id: env('EBAY_CLIENT_ID'), redirect_uri: env('EBAY_RUNAME'), response_type: 'code', scope: SCOPES.join(' '), state, prompt: 'login' });
    return res.status(200).json({ authorizeUrl: u.toString() });
  }

  if (a === 'preview') {
    const t = open(secret(), b.ticket);
    const ok = t && t.k === 'ebay-wallet-ticket' && t.exp > Date.now() && createHash('sha256').update(String(b.secret || '')).digest('hex') === t.vh;
    if (!ok) return res.status(401).json({ error: 'That link has expired. Start again.' });
    return res.status(200).json({ provider: 'ebay', id: t.userId, name: t.username, display: t.username, alias: null });
  }

  if (a === 'link') return res.status(501).json({ error: 'bMarketX keeps no public copy of eBay links; the link stays in your wallet.' });
  return res.status(404).end();
}
