// Mint a seller's listings into their own bWalletX, as BSV-21 tokens: for each listing, the photo is inscribed as
// an image ordinal and a deploy+mint (supply = quantity) names it as its icon. Follows bWalletX docs/SITE-TOKENS.md
// §5: the wallet hands out the receive keys, the site builds the scripts, the wallet signs and pays, and the deploys
// come into the wallet's bsv21 basket with internalizeAction. Needs the @bsv/sdk UMD build (window.bsv).

const FEE_SAT_PER_BYTE = 0.1; // 100 sat/kB, the bMintX / NPG rate
const enc = (s) => new TextEncoder().encode(s);
function push(b) {
  const n = b.length;
  if (n < 0x4c) return [n, ...b];
  if (n <= 0xff) return [0x4c, n, ...b];
  if (n <= 0xffff) return [0x4d, n & 0xff, n >> 8, ...b];
  return [0x4e, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24, ...b];
}
const toHex = (a) => Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
function p2pkh(pubHex) {
  const { Hash, Utils } = window.bsv;
  return [0x76, 0xa9, 0x14, ...Hash.hash160(Utils.toArray(pubHex, 'hex')), 0x88, 0xac];
}
// OP_0 OP_IF "ord" OP_1 <type> OP_0 <body> OP_ENDIF, then P2PKH and nothing else
const inscription = (type, body, pubHex) =>
  toHex([0x00, 0x63, ...push(enc('ord')), 0x51, ...push(enc(type)), 0x00, ...push(body), 0x68, ...p2pkh(pubHex)]);

/** A short ticker for a listing: its SKU if it has a clean one, else BMX<id>. */
export const symFor = (l) => {
  const s = String(l.sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length >= 3 && s.length <= 16 ? s : `BMX${l.id}`;
};
/** eBay serves photos with CORS open; 500px keeps a card photo near 50 KB. */
export const photoUrl = (u) => u && u.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)/i, '/s-l500.$1');

export async function loadPhoto(l) {
  const u = photoUrl(l.images?.[0]);
  if (!u) return null;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Photo for "${l.title}" didn't load (${r.status}).`);
  const type = (r.headers.get('content-type') || '').split(';')[0];
  if (!/^image\/(png|jpeg|gif|webp|avif|svg\+xml)$/.test(type)) throw new Error(`Photo for "${l.title}" isn't an image we can mint.`);
  const body = new Uint8Array(await r.arrayBuffer());
  if (body.length > 1_000_000) throw new Error(`Photo for "${l.title}" is over 1 MB.`);
  return { type, body };
}

/** Rough cost in sats for a set of photo sizes (bytes), for the quote before minting. */
export const quoteSats = (sizes) => Math.ceil(sizes.reduce((a, n) => a + (n + 260) * FEE_SAT_PER_BYTE + 2, 0) + 50);

/**
 * Mint one batch (keep it to ~10) in one transaction, so the wallet asks once.
 * -> { txid, minted: [{ listingId, vout, iconVout }] }
 */
export async function mintBatch(wallet, listings, onStep = () => {}) {
  const outputs = [], plan = [];
  for (const l of listings) {
    onStep(`Getting photo: ${l.title}`);
    const photo = await loadPhoto(l);
    let iconVout = null;
    if (photo) {
      const ico = await wallet.getPublicKey({ protocolID: [1, 'bwalletx ordinal receive'], keyID: 'ordinal', counterparty: 'self' });
      iconVout = outputs.length;
      outputs.push({
        lockingScript: inscription(photo.type, photo.body, ico.publicKey), satoshis: 1, basket: '1sat',
        customInstructions: JSON.stringify({ keyID: ico.keyID || 'ordinal' }), outputDescription: `Photo: ${l.title}`.slice(0, 120),
      });
    }
    const dep = await wallet.getPublicKey({ protocolID: [1, 'bwalletx token receive'], keyID: 'deploy', counterparty: 'self' });
    const json = { p: 'bsv-20', op: 'deploy+mint', sym: symFor(l), amt: String(Math.max(1, l.quantity | 0)), dec: '0' };
    if (iconVout != null) json.icon = `_${iconVout}`;
    plan.push({ listingId: l.id, vout: outputs.length, iconVout, keyID: dep.keyID || 'deploy' });
    outputs.push({ lockingScript: inscription('application/bsv-20', enc(JSON.stringify(json)), dep.publicKey), satoshis: 1, outputDescription: `List ${json.sym}` });
  }
  onStep('Waiting for you to approve in bWalletX…');
  const { txid, tx } = await wallet.createAction({
    description: listings.length === 1 ? `Mint your listing ${symFor(listings[0])}` : `Mint ${listings.length} of your listings`,
    outputs, options: { randomizeOutputs: false },
  });
  onStep('Putting the tokens in your wallet…');
  await wallet.internalizeAction({
    tx, description: 'Your bMarketX listings',
    outputs: plan.map((p) => ({ outputIndex: p.vout, protocol: 'basket insertion', insertionRemittance: { basket: 'bsv21', customInstructions: JSON.stringify({ keyID: p.keyID }) } })),
  });
  return { txid, minted: plan.map(({ listingId, vout, iconVout }) => ({ listingId, vout, iconVout: iconVout ?? -1 })) };
}
