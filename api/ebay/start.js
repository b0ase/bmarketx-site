// GET /api/ebay/start -> 302 to eBay's sign-in. The signed-in wallet proves it owns an eBay account; nothing from
// eBay is kept until the callback checks it. Scopes are read-only: who you are, and your eBay store.
import { randomBytes } from 'node:crypto';
import { seal, secret } from '../bwalletx/_auth.js';
import { who } from '../_util.js';

export const SCOPES = ['https://api.ebay.com/oauth/api_scope/commerce.identity.readonly', 'https://api.ebay.com/oauth/api_scope/sell.stores.readonly'];
const env = (k) => String(process.env[k] || '').trim();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.redirect(302, '/sell?ebay=signin#link');
  if (!env('EBAY_CLIENT_ID') || !env('EBAY_RUNAME')) return res.redirect(302, '/sell?ebay=off#link');
  const n = randomBytes(16).toString('base64url');
  const state = seal(secret(), { me, n, exp: Date.now() + 10 * 60_000 });
  // the nonce also sits in a cookie, so a state copied into someone else's browser is useless
  res.setHeader('Set-Cookie', `bmx_ebay=${n}; Path=/api/ebay; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
  const u = new URL('https://auth.ebay.com/oauth2/authorize');
  u.search = new URLSearchParams({ client_id: env('EBAY_CLIENT_ID'), redirect_uri: env('EBAY_RUNAME'), response_type: 'code', scope: SCOPES.join(' '), state, prompt: 'login' });
  return res.redirect(302, u.toString());
}
