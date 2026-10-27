// eBay Marketplace Account Deletion notices (required for production eBay API keys).
//   GET  ?challenge_code=…  -> { challengeResponse }  proves we own this endpoint
//   POST <notification>     -> 204, after checking eBay signed it, then forgets what we hold from eBay about that user
// What we forget: the proved eBay store name, the eBay feedback / sold / follower numbers, the eBay user id and the
// eBay item numbers on their listings. The bMarketX store and listings stay: they belong to the seller's wallet.
// Env: EBAY_VERIFY_TOKEN (set in the eBay portal too), EBAY_CLIENT_ID + EBAY_CLIENT_SECRET (to fetch eBay's
// signing key). Without the client keys a notice is acknowledged but nothing is deleted, and that's logged.
import { createHash, createVerify } from 'node:crypto';
import { db } from '../_db.js';
import { q, rows } from '../_util.js';

const ENDPOINT = 'https://bmarketx.com/api/ebay/deletion';
const env = (k) => String(process.env[k] || '').trim();

async function rawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const parts = [];
  for await (const c of req) parts.push(c);
  return Buffer.concat(parts).toString('utf8');
}

const keys = new Map();   // kid -> PEM, kept while the function stays warm
async function publicKey(kid) {
  if (keys.has(kid)) return keys.get(kid);
  const id = env('EBAY_CLIENT_ID'), secret = env('EBAY_CLIENT_SECRET');
  if (!id || !secret) return null;
  const t = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  }).then((r) => r.json());
  if (!t.access_token) throw new Error('eBay token refused');
  const k = await fetch(`https://api.ebay.com/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`, { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
  if (!k.key) throw new Error('eBay public key missing');
  // eBay returns the key with its BEGIN/END lines on one line; rebuild a proper PEM
  const b64 = k.key.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
  keys.set(kid, pem);
  return pem;
}

/** true = eBay signed this body; false = it didn't; null = we can't check yet (no client keys). */
async function signedByEbay(header, body) {
  let sig;
  try { sig = JSON.parse(Buffer.from(String(header || ''), 'base64').toString('utf8')); } catch { return false; }
  if (!sig?.kid || !sig?.signature) return false;
  const pem = await publicKey(sig.kid);
  if (!pem) return null;
  return createVerify('sha1').update(body).verify(pem, Buffer.from(sig.signature, 'base64'));
}

async function forget(d, username, userId) {
  const name = String(username || '').toLowerCase();
  const or = [name && `ebay_name.eq.${q(name)}`, userId && `ebay_user_id.eq.${q(userId)}`].filter(Boolean).join(',');
  if (!or) return 0;
  const hit = await rows(await d(`bmx_stores?or=(${or})&select=handle`));
  for (const s of hit) {
    await rows(await d(`bmx_stores?handle=eq.${q(s.handle)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
      ebay_name: null, ebay_user_id: null, ebay_feedback: null, ebay_sold: null, ebay_followers: null, verified_at: null,
    }) }));
    await rows(await d(`bmx_listings?store_handle=eq.${q(s.handle)}&ebay_id=not.is.null`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ ebay_id: null }) }));
  }
  return hit.length;
}

export default async function handler(req, res) {
  const token = env('EBAY_VERIFY_TOKEN');
  if (!token) return res.status(503).end();
  if (req.method === 'GET') {
    const code = String(req.query.challenge_code || '');
    if (!code) return res.status(400).end();
    res.setHeader('content-type', 'application/json');
    return res.status(200).json({ challengeResponse: createHash('sha256').update(code + token + ENDPOINT).digest('hex') });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const body = await rawBody(req);
  let n;
  try { n = JSON.parse(body); } catch { return res.status(400).end(); }
  if (n?.metadata?.topic !== 'MARKETPLACE_ACCOUNT_DELETION') return res.status(400).end();
  const id = String(n.notification?.notificationId || '').slice(0, 100);

  let ok;
  try { ok = await signedByEbay(req.headers['x-ebay-signature'], body); }
  catch (e) { console.error('ebay deletion: key check failed', e.message); return res.status(500).end(); }   // eBay retries
  if (ok === false) return res.status(412).end();

  const d = db();
  let matched = 0;
  if (ok && d) {
    const u = n.notification?.data || {};
    try { matched = await forget(d, u.username, u.userId); }
    catch (e) { console.error('ebay deletion: delete failed', id); return res.status(500).end(); }   // eBay retries
  }
  // the record keeps no personal data: which notice, when, and whether we acted on it
  if (d) await d('bmx_ebay_deletions', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({
    notification_id: id || null, verified: ok === true, stores_cleared: matched,
  }) }).catch(() => {});
  if (ok === null) console.warn('ebay deletion: received but not verified (no EBAY_CLIENT_ID/SECRET yet)', id);
  return res.status(204).end();
}
