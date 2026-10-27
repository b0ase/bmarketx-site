/* bMarketX shared shell: header, footer, prices and cards. Each page sets <body data-page="..."> and its own
   script reads window.BMX. */
(() => {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const logo = () => `<a class="logo" href="/" aria-label="bMarketX home"><img src="/brand/logo.svg" alt="bMarketX" height="34"></a>`;
  const params = new URLSearchParams(location.search);

  document.body.insertAdjacentHTML('afterbegin', `
  <div class="top"><div class="wrap">
    <a class="hide-s" href="/deals">Deals</a>
    <a class="hide-s" href="/c/fashion">Fashion</a>
    <a class="hide-s" href="/help">Help &amp; Contact</a>
    <div class="r">
      <div class="dd"><a href="/sell">Sell</a><div class="menu sellmenu">
        <b>Sell on bMarketX.com</b><span class="muted">Bring the shop you already have, or start a new one.</span>
        <ul><li>Move your eBay store in about a minute</li><li>Paid in BSV, straight to your wallet</li><li>Your listings minted to you, not us</li></ul>
        <p><a class="btn" href="/sell">Move from eBay</a> <a class="btn ghost" href="/list">List an item</a></p>
      </div></div>
      <div class="dd hide-s"><a href="/my#watch">Watchlist</a><div class="menu" data-watchmenu></div></div>
      <div class="dd"><a href="/my">My bMarketX</a><div class="menu links">
        <a href="/my#summary">Summary</a><a href="/my#recent">Recently viewed</a><a href="/my#bids">Bids &amp; offers</a><a href="/my#watch">Watchlist</a><a href="/my#purchases">Purchase history</a><a href="/my#selling">Selling</a><a href="/my#searches">Saved searches</a><a href="/my#sellers">Saved sellers</a><a href="/my#messages">Messages</a>
      </div></div>
      <a href="#" data-soon aria-label="Basket">🛒</a>
      <span data-bwx></span>
    </div>
  </div></div>
  <div class="head"><div class="wrap">
    ${logo()}
    <div class="cats">Shop by category</div>
    <form class="search" action="/search" role="search">
      <div class="box"><input name="q" placeholder="Search for anything" value="${esc(params.get('q') || '')}" aria-label="Search for anything"><select aria-label="Category"><option>All Categories</option><option>Collectibles</option><option>Trading Cards</option></select></div>
      <button class="btn" type="submit">Search</button>
    </form>
    <a class="adv" href="/search">Advanced</a>
  </div></div>`);
  document.body.insertAdjacentHTML('beforeend', `
  <div class="foot"><div class="wrap">
    <span>Paid in BSV with <a class="u" href="https://bwalletx.com">bWalletX</a> · a b*X app from The Bitcoin Corporation</span>
    <a href="/sell">Move your eBay store</a><a href="https://bwalletx.com/privacy">Privacy</a><a href="https://bwalletx.com/terms">Terms</a>
  </div></div>`);
  const wm = document.querySelector('[data-watchmenu]');
  if (wm) wm.parentElement.addEventListener('mouseenter', () => {
    const w = watch.get().slice(0, 4);
    wm.innerHTML = w.length ? w.map((i) => `<a class="mini" href="/itm/${i.id}">${i.images[0] ? `<img src="${esc(img(i.images[0], 140).src)}" alt="">` : '<span></span>'}<span>${esc(i.title)}</span></a>`).join('') + '<a href="/my#watch"><b>See all in Watchlist</b></a>'
      : '<span class="muted">Tap ♡ on any listing to watch it.</span>';
  });
  // "Give feedback" tab and pop-up, on every page
  document.body.insertAdjacentHTML('beforeend', '<button class="fbtab" type="button">Give feedback</button>');
  document.querySelector('.fbtab').onclick = () => {
    const m = document.createElement('div'); m.className = 'bwx-modal';
    m.innerHTML = `<form class="fbform"><h3 style="margin:0 0 4px">Tell us what you think</h3>
      <p class="muted" style="margin:0 0 12px">How useful was this page?</p>
      <div class="fbscale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}" required><span>${n}</span></label>`).join('')}</div>
      <div class="fbends muted"><span>Not at all useful</span><span>Very useful</span></div>
      <label>How could we make it better? <span class="muted" data-n>0/500</span><textarea name="comment" maxlength="500" rows="4"></textarea></label>
      <label>Email, if we may contact you (optional)<input name="contact" maxlength="100"></label>
      <label class="fbwallet"><input type="checkbox" name="withWallet"> Include my bWalletX key (if signed in)</label>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn">Send</button></div>
      <p class="err" data-e></p></form>`;
    document.body.appendChild(m);
    const f = m.querySelector('form'), close = () => m.remove();
    m.onclick = (e) => { if (e.target === m) close(); }; f.querySelector('[data-x]').onclick = close;
    f.comment.oninput = () => (f.querySelector('[data-n]').textContent = `${f.comment.value.length}/500`);
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/api/feedback', { method: 'POST', body: JSON.stringify({ page: location.pathname, rating: f.rating.value, comment: f.comment.value, contact: f.contact.value, withWallet: f.withWallet.checked }) });
        f.innerHTML = '<h3>Thank you.</h3><p class="muted">We read every one.</p>'; setTimeout(close, 1600);
      } catch (er) { f.querySelector('[data-e]').textContent = er.message; }
    };
  };
  document.querySelectorAll('[data-soon]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); alertBar('Coming soon: this part of bMarketX is being built.'); }));

  function alertBar(msg) {
    let b = document.getElementById('bmxBar');
    if (!b) { b = document.createElement('div'); b.id = 'bmxBar'; b.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#191919;color:#fff;padding:10px 18px;border-radius:24px;z-index:60;font-size:13px;max-width:calc(100% - 32px)'; document.body.appendChild(b); }
    b.textContent = msg; b.style.display = 'block'; clearTimeout(b._t); b._t = setTimeout(() => (b.style.display = 'none'), 3500);
  }

  // live BSV price (USD), so every price also shows what it costs in BSV
  let usdPerBsv = null;
  const priceReady = fetch('https://api.whatsonchain.com/v1/bsv/main/exchangerate').then((r) => r.json())
    .then((j) => { usdPerBsv = +j.rate || null; document.querySelectorAll('[data-bsv]').forEach(fillBsv); }).catch(() => {});
  function fillBsv(el) { if (usdPerBsv) el.textContent = `≈ ${(+el.dataset.bsv / 100 / usdPerBsv).toFixed(5)} BSV`; }
  const usd = (c) => '$' + (c / 100).toFixed(2);

  // eBay photos come in sizes (s-l140 … s-l1600) and as WebP; a grid card needs ~500px, not the 775 KB original
  const img = (u, px) => {
    const m = /^(https:\/\/i\.ebayimg\.com\/.+\/s-l)\d+\.(jpg|jpeg|png|webp)$/i.exec(u || '');
    return m ? { src: `${m[1]}${px}.jpg`, webp: `${m[1]}${px}.webp` } : { src: u };
  };
  const picture = (u, px, attrs = '') => { const p = img(u, px);
    return `<picture>${p.webp ? `<source srcset="${esc(p.webp)}" type="image/webp">` : ''}<img src="${esc(p.src)}" decoding="async" ${attrs}></picture>`; };
  // Watchlist and recently viewed live in this browser (per-viewer conveniences, not account data)
  const store = (k) => ({ get: () => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } },
    set: (v) => { try { localStorage.setItem(k, JSON.stringify(v.slice(0, 100))); } catch {} } });
  const watch = store('bmx-watch'), recent = store('bmx-recent');
  const brief = (i) => ({ id: i.id, title: i.title, price_cents: i.price_cents, was_cents: i.was_cents || null, images: (i.images || []).slice(0, 1) });
  const watching = (id) => watch.get().some((x) => x.id === id);
  function toggleWatch(i) {
    const w = watch.get(), on = w.some((x) => x.id === i.id);
    watch.set(on ? w.filter((x) => x.id !== i.id) : [brief(i), ...w]);
    alertBar(on ? 'Removed from your Watchlist.' : 'Added to your Watchlist.');
    return !on;
  }
  const seen = (i) => recent.set([brief(i), ...recent.get().filter((x) => x.id !== i.id)]);
  const shown = new Map();
  document.addEventListener('click', (e) => {
    const h = e.target.closest('.heart[data-id]'); if (!h) return;
    e.preventDefault(); const i = shown.get(+h.dataset.id); if (!i) return;
    const on = toggleWatch(i); h.textContent = on ? '♥' : '♡'; h.classList.toggle('on', on);
  });
  const card = (i, k = 0) => `<a class="card" href="/itm/${i.id}">
    <div class="img">${i.images?.[0] ? picture(i.images[0], 500, `alt="" ${k < 8 ? 'fetchpriority="high"' : 'loading="lazy"'}`) : ''}${(shown.set(i.id, i), '')}<button class="heart${watching(i.id) ? ' on' : ''}" type="button" aria-label="Watch" data-id="${i.id}">${watching(i.id) ? '♥' : '♡'}</button></div>
    <div class="t">${esc(i.title)}</div>
    <div><span class="price">${usd(i.price_cents)}</span>${i.was_cents ? `<span class="was">${usd(i.was_cents)}</span>` : ''}</div>
    <div class="bsv" data-bsv="${i.price_cents}"></div>
    ${i.promo ? `<div class="promo">${esc(i.promo)}</div>` : ''}
  </a>`;
  const after = (html, root) => { root.innerHTML = html; root.querySelectorAll('[data-bsv]').forEach(fillBsv); };
  const api = async (url, init) => {
    const r = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
    return j;
  };
  const pager = (page, pages, href) => pages <= 1 ? '' : `<nav class="pager">${Array.from({ length: Math.min(pages, 10) }, (_, k) => k + 1)
    .map((n) => `<a class="${n === page ? 'on' : ''}" href="${href(n)}">${n}</a>`).join('')}</nav>`;

  // Every "you need a wallet" moment: connect if you have one, get it free if you don't.
  const signInBox = (why) => `<div class="getw">
      <div><b>${why || 'Sign in with bWalletX to carry on.'}</b>
        <span class="muted">Your wallet is your bMarketX account and where buyers pay you. No email, no password.</span></div>
      <div class="getw-row"><span data-bwx></span>
        <a class="btn ghost" href="https://bwalletx.com/get" target="_blank" rel="noopener">New to bWalletX? Get it free</a></div>
      <span class="muted" style="font-size:12px">Chrome extension, iPhone and Android, or use it straight away at <a class="u" href="https://web.bwalletx.com" target="_blank" rel="noopener">web.bwalletx.com</a>.</span>
    </div>`;
  // bMail compose in the buyer's own wallet: they review and press Send. `to` is the store's $handle or paymail.
  const mailTo = (to, subject, body) => 'https://web.bwalletx.com/?' + new URLSearchParams({ mail: 'compose', ...(to ? { to } : {}), subject, body });
  window.BMX = { mailTo, signInBox, esc, usd, card, picture, watch, recent, seen, toggleWatch, watching, after, api, pager, params, alertBar, priceReady, fillBsv, get usdPerBsv() { return usdPerBsv; } };
})();
