// GET /api/ebay/callback?code&state -> 302 to /my. eBay sends the seller back here after they sign in.
// We swap the code for a token, ask eBay who they are and what their store is called, and bind that eBay account to
// the signed-in wallet as a verified store. The eBay token is used once and never stored.
// A proved eBay owner wins the store address: an unverified store (a CSV upload) sitting on it moves to <name>-<n>.
import { randomBytes } from 'node:crypto';
import { open, secret } from '../bwalletx/_auth.js';
import { db } from '../_db.js';
import { q, rows, who } from '../_util.js';
import { storeName } from '../../lib/ebay.js';

const env = (k) => String(process.env[k] || '').trim();
const back = (res, why) => res.redirect(302, `/sell?ebay=${why}#link`);
const cookie = (h, k) => (String(h || '').match(new RegExp(`(?:^|;\\s*)${k}=([^;]+)`)) || [])[1];

async function token(code) {
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(`${env('EBAY_CLIENT_ID')}:${env('EBAY_CLIENT_SECRET')}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env('EBAY_RUNAME') }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`eBay token ${r.status} ${j.error || ''}`);
  return j.access_token;
}
const get = async (url, t) => { const r = await fetch(url, { headers: { authorization: `Bearer ${t}`, accept: 'application/json' } }); return r.ok ? r.json() : null; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', 'bmx_ebay=; Path=/api/ebay; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  if (req.query.error || !req.query.code) return back(res, 'declined');
  const st = open(secret(), req.query.state);
  const me = await who(req);
  if (!st || st.exp < Date.now() || st.n !== cookie(req.headers.cookie, 'bmx_ebay') || !me || st.me !== me) return back(res, 'expired');
  const d = db();
  if (!d) return back(res, 'off');

  try {
    const t = await token(String(req.query.code));
    const user = await get('https://apiz.ebay.com/commerce/identity/v1/user/', t);
    if (!user?.userId || !user?.username) return back(res, 'failed');
    const shop = await get('https://api.ebay.com/sell/stores/v1/store', t);
    // the eBay store's /str/<name>, else the eBay username
    const name = storeName(shop?.storeUrl || shop?.url || '') || storeName(String(user.username).toLowerCase().replace(/[^a-z0-9._-]/g, '')) || null;
    if (!name) return back(res, 'failed');

    const [held] = await rows(await d(`bmx_stores?or=(ebay_user_id.eq.${q(user.userId)},ebay_name.eq.${q(name)})&select=handle,owner_key`));
    if (held && held.owner_key !== me) return back(res, 'taken');

    const proof = { ebay_name: name, ebay_user_id: user.userId, verified_at: new Date().toISOString() };
    if (held) {
      await rows(await d(`bmx_stores?handle=eq.${q(held.handle)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(proof) }));
      return res.redirect(302, `/my?ebay=verified#selling`);
    }
    const [sitting] = await rows(await d(`bmx_stores?handle=eq.${q(name)}&select=handle,owner_key,verified_at`));
    const other = () => `${name.slice(0, 56)}-${randomBytes(2).toString('hex')}`;
    let handle = name;
    if (sitting && sitting.owner_key === me) {
      await rows(await d(`bmx_stores?handle=eq.${q(name)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(proof) }));
    } else {
      // an unverified store on the address moves aside; a store verified some other way keeps it
      if (sitting && !sitting.verified_at) await rows(await d(`bmx_stores?handle=eq.${q(name)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ handle: other() }) }));
      else if (sitting) handle = other();
      await rows(await d('bmx_stores', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
        handle, owner_key: me, display_name: String(shop?.storeName || shop?.name || user.username).slice(0, 80), ...proof,
      }) }));
    }
    return res.redirect(302, `/my?ebay=verified#selling`);
  } catch (e) {
    console.error('ebay callback', e.message);
    return back(res, 'failed');
  }
}
