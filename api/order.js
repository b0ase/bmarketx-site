// Checkout: the buyer's wallet pays the seller's wallet directly, nothing passes through bMarketX and there is no fee.
//   GET  /api/order                                   -> { bought: [...], sold: [...] } for the signed-in wallet
//   POST /api/order { action: 'quote', listingId, qty, shipTo } -> { order: { id, sats, lockingScript, ... } }
//   POST /api/order { action: 'pay', id, txid, beef }  -> { status }   (beef: hex AtomicBEEF from createAction)
//   POST /api/order { action: 'collected' | 'shipped' | 'received' | 'cancel', id, tracking? } -> { status }
// Each order pays a fresh BRC-29 address of the seller's identity key, derived with counterparty "anyone"
// (private key 1). That lets this server work out the address and check the payment, while only the seller's
// wallet can spend it: it takes the payment in with internalizeAction and senderIdentityKey = ANYONE.
import { randomBytes } from 'node:crypto';
import { P2PKH, PrivateKey, PublicKey, Transaction } from '@bsv/sdk';
import { db } from './_db.js';
import { body, fail, originOk, q, rows, who, limited } from './_util.js';

const ANYONE = new PrivateKey(1);
export const ANYONE_KEY = ANYONE.toPublicKey().toString();
const WOC = 'https://api.whatsonchain.com/v1/bsv/main';
const SEEN = 'id,listing_id,store_handle,title,buyer_key,seller_key,qty,price_cents,ship_cents,total_cents,usd_per_bsv,sats,status,oversold,txid,vout,tracking,ship_to,created_at,expires_at,paid_at,collected_at,shipped_at,received_at';

const err = (status, message) => Object.assign(new Error(message), { status });
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** P2PKH (hex) of the seller's BRC-29 key for this prefix and suffix. */
export const payScript = (sellerKey, prefix, suffix) =>
  new P2PKH().lock(PublicKey.fromString(sellerKey).deriveChild(ANYONE, `2-3241645161d8-${prefix} ${suffix}`).toAddress()).toHex();

async function usdPerBsv() {
  const r = await fetch(`${WOC}/exchangerate`).catch(() => null);
  const rate = r?.ok ? +(await r.json()).rate : 0;
  if (!(rate > 0)) throw err(503, 'Couldn’t get the BSV price just now. Try again in a minute.');
  return rate;
}

function shipTo(s) {
  const a = { name: clip(s?.name, 80), line1: clip(s?.line1, 120), line2: clip(s?.line2, 120), city: clip(s?.city, 80),
    region: clip(s?.region, 80), postcode: clip(s?.postcode, 20), country: clip(s?.country, 60) };
  if (!a.name || !a.line1 || !a.city || !a.postcode || !a.country) throw err(400, 'Add a name and full postal address.');
  return a;
}

// Is the payment on the network? Broadcast it ourselves too (harmless if the wallet already did).
async function onNetwork(tx) {
  const txid = tx.id('hex');
  await fetch(`${WOC}/tx/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txhex: tx.toHex() }) }).catch(() => {});
  for (let k = 0; k < 4; k++) {
    const r = await fetch(`${WOC}/tx/hash/${txid}`).catch(() => null);
    if (r?.ok) return true;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  return false;
}

async function quote(d, me, b) {
  const id = parseInt(b.listingId, 10), qty = parseInt(b.qty, 10) || 1;
  if (!id || qty < 1 || qty > 100) throw err(400, 'Bad item or quantity.');
  const [l] = await rows(await d(`bmx_listings?id=eq.${id}&select=id,title,price_cents,ship_cents,quantity,status,store_handle,bmx_stores!inner(owner_key,ship_cents)`));
  if (!l || l.status !== 'active') throw err(404, 'That item isn’t for sale any more.');
  if (l.quantity < qty) throw err(409, l.quantity ? `Only ${l.quantity} left.` : 'Sold out.');
  const seller = l.bmx_stores.owner_key;
  if (seller === me) throw err(400, 'That’s your own listing.');
  const ship = l.ship_cents ?? l.bmx_stores.ship_cents ?? 0;
  const total = l.price_cents * qty + ship;
  const rate = await usdPerBsv();
  const sats = Math.ceil((total / 100 / rate) * 1e8);
  const prefix = randomBytes(16).toString('base64'), suffix = randomBytes(16).toString('base64');
  const row = {
    listing_id: l.id, store_handle: l.store_handle, title: l.title, buyer_key: me, seller_key: seller, qty,
    price_cents: l.price_cents, ship_cents: ship, total_cents: total, usd_per_bsv: rate, sats,
    derivation_prefix: prefix, derivation_suffix: suffix, locking_script: payScript(seller, prefix, suffix), ship_to: shipTo(b.shipTo),
  };
  const [o] = await rows(await d(`bmx_orders?select=${SEEN},locking_script`, { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) }));
  return { order: o };
}

async function pay(d, me, b) {
  const [o] = await rows(await d(`bmx_orders?id=eq.${parseInt(b.id, 10) || 0}&buyer_key=eq.${q(me)}&select=id,status,sats,locking_script,expires_at,txid`));
  if (!o) throw err(404, 'No such order.');
  if (o.status !== 'quoted') return { status: o.status };
  let tx;
  try { tx = Transaction.fromAtomicBEEF(Array.from(Buffer.from(String(b.beef || ''), 'hex'))); }
  catch { throw err(400, 'That payment couldn’t be read.'); }
  const txid = tx.id('hex');
  if (b.txid && b.txid !== txid) throw err(400, 'That payment doesn’t match.');
  const vout = tx.outputs.findIndex((x) => x.lockingScript.toHex() === o.locking_script && x.satoshis >= o.sats);
  if (vout < 0) throw err(400, 'That payment isn’t to this seller for the full amount.');
  // a quote that ran out while the wallet was paying is still honoured: the money has gone to the seller
  if (!(await onNetwork(tx))) throw err(502, 'The payment hasn’t reached the network yet. Your wallet may still be sending it; check again in a minute.');
  const r = await d('rpc/bmx_order_paid', { method: 'POST', body: JSON.stringify({ p_order: o.id, p_txid: txid, p_vout: vout, p_beef: Buffer.from(tx.toAtomicBEEF()).toString('hex') }) });
  const res = await rows(r);
  if (res === 'missing') throw err(404, 'No such order.');
  return { status: 'paid', txid };
}

// who may move an order on, and from where
const STEPS = {
  // taking the payment into the seller's wallet is noted, not a status: it can happen before or after shipping
  collected: { by: 'seller_key', from: ['paid', 'shipped', 'received'], stamp: 'collected_at', keep: true },
  shipped: { by: 'seller_key', from: ['paid'], stamp: 'shipped_at' },
  received: { by: 'buyer_key', from: ['paid', 'shipped'], stamp: 'received_at' },
  cancel: { by: 'buyer_key', from: ['quoted'], to: 'cancelled' },
};
async function step(d, me, b) {
  const s = STEPS[b.action];
  const id = parseInt(b.id, 10) || 0;
  const [o] = await rows(await d(`bmx_orders?id=eq.${id}&${s.by}=eq.${q(me)}&select=id,status`));
  if (!o) throw err(404, 'No such order.');
  if (!s.from.includes(o.status)) throw err(409, `This order is ${o.status}.`);
  const patch = { ...(s.keep ? {} : { status: s.to || b.action }), ...(s.stamp ? { [s.stamp]: new Date().toISOString() } : {}) };
  if (b.action === 'shipped') patch.tracking = clip(b.tracking, 120) || null;
  await rows(await d(`bmx_orders?id=eq.${id}&status=in.(${s.from.join(',')})`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(patch) }));
  return { status: patch.status || o.status };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const me = await who(req);
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  const d = db();
  if (!d) return res.status(503).json({ error: 'The market database is not switched on yet.' });
  try {
    if (req.method === 'GET') {
      const [bought, sold] = await Promise.all([
        rows(await d(`bmx_orders?buyer_key=eq.${q(me)}&status=neq.quoted&select=${SEEN}&order=created_at.desc&limit=200`)),
        // the seller also gets what their wallet needs to take each payment in
        rows(await d(`bmx_orders?seller_key=eq.${q(me)}&status=in.(paid,shipped,received)&select=${SEEN},derivation_prefix,derivation_suffix,beef&order=created_at.desc&limit=200`)),
      ]);
      return res.status(200).json({ bought, sold, anyone: ANYONE_KEY });
    }
    if (req.method !== 'POST') return res.status(405).end();
    if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
    const b = await body(req);
    if (b.action === 'quote' && await limited(req, res, 'quote', 30, 600, me)) return;
    if (b.action === 'quote') return res.status(200).json(await quote(d, me, b));
    if (b.action === 'pay') return res.status(200).json(await pay(d, me, b));
    if (STEPS[b.action]) return res.status(200).json(await step(d, me, b));
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) { return fail(res, e); }
}
