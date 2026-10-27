/* Buy It Now: the buyer's bWalletX pays the seller's wallet directly. The server quotes the BSV amount and the
   seller's one-off address; the wallet shows it, the buyer approves, and the server checks the payment arrived. */
(() => {
  const { esc, api, usd, alertBar } = BMX;
  const FIELDS = [['name', 'Full name'], ['line1', 'Address line 1'], ['line2', 'Address line 2 (optional)'], ['city', 'Town or city'],
    ['region', 'County, state or region'], ['postcode', 'Postcode / ZIP'], ['country', 'Country']];
  const saved = () => { try { return JSON.parse(localStorage.getItem('bmx-shipto') || '{}'); } catch { return {}; } };
  const keep = (a) => { try { localStorage.setItem('bmx-shipto', JSON.stringify(a)); } catch {} };
  const hex = (a) => Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => (h.match(/../g) || []).map((x) => parseInt(x, 16));

  async function wallet() {
    if (window.bmxWallet) return window.bmxWallet;
    const { wallet } = await window.bWalletXConnect.connectBwalletX({ reusePairing: true });
    return (window.bmxWallet = wallet);
  }

  async function signedIn() {
    const j = await fetch('/api/bwalletx/session', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({}));
    return j.identityKey || null;
  }

  function modal(html) {
    const m = document.createElement('div'); m.className = 'bwx-modal';
    m.innerHTML = `<div class="ckout">${html}</div>`;
    m.onclick = (e) => { if (e.target === m) m.remove(); };
    document.body.appendChild(m);
    return m;
  }

  window.BMXcheckout = async (item, store) => {
    if (!(await signedIn())) {
      const m = modal(BMX.signInBox('Sign in with bWalletX to buy. You pay the seller straight from your wallet.'));
      document.addEventListener('bmarketx-wallet', () => { m.remove(); window.BMXcheckout(item, store); }, { once: true });
      return;
    }
    const a = saved();
    const ship = item.ship_cents ?? store.ship_cents ?? 0;
    const max = Math.min(item.quantity, 100);
    const m = modal(`<form>
      <h3>Buy It Now</h3>
      <div class="ck-item">${item.images[0] ? BMX.picture(item.images[0], 140, 'alt=""') : ''}<div><b>${esc(item.title)}</b><span class="muted">from ${esc(store.display_name)}</span></div></div>
      <label class="ck-qty">Quantity <input name="qty" type="number" min="1" max="${max}" value="1" ${max < 2 ? 'readonly' : ''}> <span class="muted">${item.quantity} available</span></label>
      <fieldset><legend>Post to</legend>${FIELDS.map(([k, t]) => `<input name="${k}" placeholder="${t}" value="${esc(a[k] || '')}" ${k === 'line2' || k === 'region' ? '' : 'required'} autocomplete="${{ name: 'name', line1: 'address-line1', line2: 'address-line2', city: 'address-level2', region: 'address-level1', postcode: 'postal-code', country: 'country-name' }[k]}">`).join('')}</fieldset>
      <div class="ck-sum"><span>Item</span><b data-it></b><span>Postage</span><b>${ship ? usd(ship) : 'Free'}</b><span>Total</span><b data-tot></b></div>
      <p class="muted" style="font-size:12px;margin:8px 0">Paid in BSV straight to the seller’s wallet. bMarketX takes no fee. Your address is shown only to this seller.</p>
      <div class="ck-row"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn">Review payment</button></div>
      <p class="err" data-e></p></form>`);
    const f = m.querySelector('form'), e = f.querySelector('[data-e]');
    const sum = () => { const n = Math.max(1, Math.min(max, +f.qty.value || 1)); f.querySelector('[data-it]').textContent = usd(item.price_cents * n); f.querySelector('[data-tot]').textContent = usd(item.price_cents * n + ship); };
    f.qty.oninput = sum; sum();
    f.querySelector('[data-x]').onclick = () => m.remove();
    f.onsubmit = async (ev) => {
      ev.preventDefault(); e.textContent = '';
      const shipTo = Object.fromEntries(FIELDS.map(([k]) => [k, f[k].value.trim()]));
      keep(shipTo);
      const btn = f.querySelector('button:not([data-x])'); btn.disabled = true; btn.textContent = 'Getting the price…';
      try {
        const { order: o } = await api('/api/order', { method: 'POST', body: JSON.stringify({ action: 'quote', listingId: item.id, qty: +f.qty.value || 1, shipTo }) });
        review(m, o, store);
      } catch (er) { e.textContent = er.message; btn.disabled = false; btn.textContent = 'Review payment'; }
    };
  };

  function review(m, o, store) {
    const box = m.querySelector('.ckout');
    box.innerHTML = `<h3>Pay ${esc(store.display_name)}</h3>
      <div class="ck-big">${(o.sats / 1e8).toFixed(8)} BSV</div>
      <p class="muted" style="text-align:center;margin-top:0">${usd(o.total_cents)} at $${(+o.usd_per_bsv).toFixed(2)} per BSV · ${o.sats.toLocaleString()} sats</p>
      <p>Your bWalletX will ask you to approve this payment to the seller. Check the amount there before you press Allow.</p>
      <div class="ck-row"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn" type="button" data-pay>Pay with bWalletX</button></div>
      <p class="err" data-e></p>`;
    const e = box.querySelector('[data-e]'), btn = box.querySelector('[data-pay]');
    box.querySelector('[data-x]').onclick = () => { api('/api/order', { method: 'POST', body: JSON.stringify({ action: 'cancel', id: o.id }) }).catch(() => {}); m.remove(); };
    let sent = null;   // once the wallet has paid, never ask it to pay again: only re-check
    btn.onclick = async () => {
      btn.disabled = true; e.textContent = '';
      try {
        if (!sent) {
          btn.textContent = 'Waiting for your wallet…';
          const w = await wallet();
          const r = await w.createAction({
            description: `bMarketX order ${o.id}`.slice(0, 50),
            outputs: [{ lockingScript: o.locking_script, satoshis: o.sats, outputDescription: `Payment to ${store.display_name}`.slice(0, 50) }],
            labels: ['bmarketx'], options: { randomizeOutputs: false },
          });
          if (!r?.tx) throw new Error('Your wallet didn’t send the payment.');
          sent = { txid: r.txid, beef: hex(r.tx) };
        }
        btn.textContent = 'Checking the payment…';
        await api('/api/order', { method: 'POST', body: JSON.stringify({ action: 'pay', id: o.id, ...sent }) });
        box.innerHTML = `<h3>Paid. Thank you!</h3><p>${esc(store.display_name)} has your order and your address. Your receipt is in <a class="u" href="/my#purchases">Purchase history</a>.</p>
          <p class="muted" style="font-size:12px">Payment <a class="u" target="_blank" rel="noopener" href="https://whatsonchain.com/tx/${esc(sent.txid)}">${esc(sent.txid.slice(0, 16))}…</a></p>
          <div class="ck-row"><a class="btn" href="/my#purchases">See my order</a></div>`;
      } catch (er) {
        e.textContent = sent ? `${er.message} Don’t pay again: press the button to check once more.` : er.message;
        btn.disabled = false; btn.textContent = sent ? 'Check again' : 'Pay with bWalletX';
      }
    };
  }
  window.BMXpay = { hex, fromHex, wallet };
})();
