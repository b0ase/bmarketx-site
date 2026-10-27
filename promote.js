/* Promote this listing: the seller buys a bAds campaign (bAdvertisingX, ad server at www.bchatx.com/api/bads) that
   shows the listing's photo as a square in the network rail and links to the listing. The seller's own bWalletX signs
   in to bAds and pays; bMarketX only hands over the listing link and its square image (/api/square). */
(() => {
  const ADS = 'https://www.bchatx.com/api/bads';
  const { esc } = BMX;
  const utf8 = (s) => Array.from(new TextEncoder().encode(s));
  const hex = (a) => Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
  let token = null;

  async function ads(path, init = {}) {
    const r = await fetch(ADS + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503) throw new Error('Promote isn’t taking orders yet. Nothing has been charged.');
    if (!r.ok) throw new Error(j.error || `bAds answered ${r.status}.`);
    return j;
  }

  // bAds session: the wallet signs bAds' challenge (protocol [2,'bads session'], counterparty anyone)
  async function signIn(w) {
    if (token) return;
    const ch = await ads('/session', { method: 'POST', body: '{}' });
    const { publicKey } = await w.getPublicKey({ identityKey: true });
    const { signature } = await w.createSignature({ protocolID: ch.protocolID, keyID: ch.keyID || ch.nonce, counterparty: ch.counterparty || 'anyone', data: utf8(ch.message) });
    ({ token } = await ads('/session/verify', { method: 'POST', body: JSON.stringify({ challenge: ch.challenge, identityKey: publicKey, signature }) }));
  }

  window.BMXpromote = (item) => {
    const m = document.createElement('div'); m.className = 'bwx-modal';
    m.innerHTML = `<div class="ckout"><h3>Promote this listing</h3>
      <div class="ck-item"><img src="/api/square?id=${item.id}" alt="" style="width:120px;height:120px"><div><b>${esc(item.title)}</b><span class="muted">Shown as a square ad down the side of bMarketX and other b*X sites, linking to this listing.</span></div></div>
      <form style="margin-top:12px"><label class="ck-qty">Budget (US$) <input name="usd" type="number" min="10" step="1" value="10"></label>
      <p class="muted" style="font-size:12px">Pay per 1,000 views. The owner checks every ad before it goes live. Paid from your bWalletX in BSV to bAdvertisingX.</p>
      <div class="ck-row"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn">Review and pay</button></div><p class="err" data-e></p></form></div>`;
    document.body.appendChild(m);
    const f = m.querySelector('form'), e = f.querySelector('[data-e]'), btn = f.querySelector('button:not([data-x])');
    m.onclick = (ev) => { if (ev.target === m) m.remove(); };
    f.querySelector('[data-x]').onclick = () => m.remove();
    let paid = false;
    f.onsubmit = async (ev) => {
      ev.preventDefault(); if (paid) return; e.textContent = ''; btn.disabled = true;
      try {
        btn.textContent = 'Waiting for your wallet…';
        const w = await BMXpay.wallet();
        await signIn(w);
        btn.textContent = 'Setting up the ad…';
        const link = `https://bmarketx.com/itm/${item.id}`;
        const c = await ads('/campaigns', { method: 'POST', body: JSON.stringify({ product: 'cpm', sites: 'network', rating: 'pg', link, cpmBudgetUsd: Math.max(10, +f.usd.value || 10), source: { kind: 'listing', ref: `bmarketx:itm/${item.id}` } }) });
        await ads(`/campaigns/${c.id}/creative`, { method: 'POST', body: JSON.stringify({ stillUrl: `https://bmarketx.com/api/square?id=${item.id}`, alt: item.title.slice(0, 120) }) });
        const q = await ads(`/campaigns/${c.id}/checkout`, { method: 'POST', body: '{}' });
        btn.textContent = 'Approve the payment in your wallet…';
        const r = await w.createAction({ description: 'bAds promotion'.slice(0, 50), labels: ['bmarketx', 'bads'],
          outputs: q.payTo.map((p) => ({ lockingScript: p.lockingScript, satoshis: p.sats, outputDescription: 'bAds promotion' })), options: { randomizeOutputs: false } });
        paid = true;
        await ads(`/campaigns/${c.id}/paid`, { method: 'POST', body: JSON.stringify({ quoteId: q.quoteId, txid: r.txid, beef: hex(r.tx) }) });
        f.innerHTML = `<p><b>Paid. Your ad is waiting for review</b> and starts as soon as it’s approved.</p><div class="ck-row"><button class="btn" type="button" data-x>Close</button></div>`;
        f.querySelector('[data-x]').onclick = () => m.remove();
      } catch (er) {
        e.textContent = paid ? `${er.message} Your payment went out; don’t pay again. Contact us with this page open.` : er.message;
        btn.disabled = paid; btn.textContent = 'Review and pay';
      }
    };
  };
})();
