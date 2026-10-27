// GET /api/ebay/callback?code&state -> 302 to /sell. eBay sends the seller back here after they sign in.
// We swap the code for a token, ask eBay who they are, what their store is called and their feedback, and bind that
// eBay account to the signed-in wallet as a verified store. The eBay token is never stored in the database: it goes
// back sealed (AES-GCM) in an HttpOnly cookie that only /api/ebay/import reads, and lapses with eBay's 2-hour expiry.
// A proved eBay owner wins the store address: an unverified store (a CSV upload) sitting on it moves to <name>-<n>.
import { randomBytes } from 'node:crypto';
import { open, seal, secret } from '../bwalletx/_auth.js';
import { db } from '../_db.js';
import { q, rows, who } from '../_util.js';
import { storeName } from '../../lib/ebay.js';
import { feedback } from '../../lib/ebay-api.js';
import { RETURNS } from './wallet/[action].js';

const env = (k) => String(process.env[k] || '').trim();
const back = (res, why) => res.redirect(302, `/sell?ebay=${why}#link`);
const cookie = (h, k) => (String(h || '').match(new RegExp(`(?:^|;\\s*)${k}=([^;]+)`)) || [])[1];
const CLEAR = 'bmx_ebay=; Path=/api/ebay; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

async function token(code) {
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(`${env('EBAY_CLIENT_ID')}:${env('EBAY_CLIENT_SECRET')}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env('EBAY_RUNAME') }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`eBay token ${r.status} ${j.error || ''}`);
  return { t: j.access_token, ttl: Math.min(+j.expires_in || 7200, 7200) };
}
const get = async (url, t) => { const r = await fetch(url, { headers: { authorization: `Bearer ${t}`, accept: 'application/json' } }).catch(() => null); return r?.ok ? r.json() : null; };

// bWalletX "Link your accounts" (api/ebay/wallet): no bMarketX session and nothing stored. Who the eBay user is goes
// back to the wallet in a sealed ticket that only the holder of the wallet's secret can open (preview).
async function walletReturn(req, res, st) {
  const to = RETURNS[st.ret] || 'https://www.bwallet.space/social';
  const go = (hash) => res.redirect(302, `${to}#${hash}`);
  if (req.query.error || !req.query.code) return go('error=cancelled');
  if (!(st.exp > Date.now())) return go('error=expired');
  try {
    const { t } = await token(String(req.query.code));
    const user = await get('https://apiz.ebay.com/commerce/identity/v1/user/', t);
    if (!user?.userId || !user?.username) return go('error=failed');
    const ticket = seal(secret(), { k: 'ebay-wallet-ticket', userId: String(user.userId), username: String(user.username), vh: st.vh, exp: Date.now() + 10 * 60_000 });
    return go(`p=ebay&t=${encodeURIComponent(ticket)}`);
  } catch (e) { console.error('ebay wallet link', e.message); return go('error=failed'); }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', CLEAR);
  const st = open(secret(), req.query.state);
  if (st?.wallet) return walletReturn(req, res, st);
  if (req.query.error || !req.query.code) return back(res, 'declined');
  const me = await who(req);
  if (!st || st.exp < Date.now() || st.n !== cookie(req.headers.cookie, 'bmx_ebay') || !me || st.me !== me) return back(res, 'expired');
  const d = db();
  if (!d) return back(res, 'off');

  try {
    const { t, ttl } = await token(String(req.query.code));
    const [user, shop, fb] = await Promise.all([
      get('https://apiz.ebay.com/commerce/identity/v1/user/', t),
      get('https://api.ebay.com/sell/stores/v1/store', t),
      feedback(t).catch(() => ({})),
    ]);
    if (!user?.userId || !user?.username) return back(res, 'failed');
    // the eBay store's /str/<name>, else the eBay username
    const name = storeName(shop?.storeUrl || shop?.url || '') || storeName(String(user.username).toLowerCase().replace(/[^a-z0-9._-]/g, '')) || null;
    if (!name) return back(res, 'failed');

    const [held] = await rows(await d(`bmx_stores?or=(ebay_user_id.eq.${q(user.userId)},ebay_name.eq.${q(name)})&select=handle,owner_key`));
    if (held && held.owner_key !== me) return back(res, 'taken');

    const proof = { ebay_name: name, ebay_user_id: user.userId, verified_at: new Date().toISOString(),
      ...(fb.score ? { ebay_feedback: fb.positive || null, ebay_sold: null, ebay_followers: null } : {}) };
    let handle = held?.handle || name;
    if (held) {
      await rows(await d(`bmx_stores?handle=eq.${q(held.handle)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(proof) }));
    } else {
      const [sitting] = await rows(await d(`bmx_stores?handle=eq.${q(name)}&select=handle,owner_key,verified_at`));
      const other = () => `${name.slice(0, 56)}-${randomBytes(2).toString('hex')}`;
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
    }
    const sealed = seal(secret(), { t, me, handle, exp: Date.now() + ttl * 1000 });
    res.setHeader('Set-Cookie', [CLEAR, `bmx_ebay_t=${sealed}; Path=/api/ebay; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Lax`]);
    return res.redirect(302, `/sell?ebay=verified&store=${encodeURIComponent(handle)}#link`);
  } catch (e) {
    console.error('ebay callback', e.message);
    return back(res, 'failed');
  }
}
