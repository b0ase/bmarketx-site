/* bMarketX shared shell: header, footer, prices and cards. Each page sets <body data-page="..."> and its own
   script reads window.BMX. */
(() => {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const logo = () => `<a class="logo" href="/" aria-label="bMarketX home"><img src="/brand/logo.svg" alt="bMarketX" height="34"></a>`;
  const params = new URLSearchParams(location.search);

  document.body.insertAdjacentHTML('afterbegin', `
  <div class="top"><div class="wrap">
    <span>Hi! <span data-bwx></span></span>
    <a class="hide-s" href="/search?q=">Deals</a>
    <a class="hide-s" href="/sell">Move from eBay</a>
    <a class="hide-s" href="https://bwalletx.com" target="_blank" rel="noopener">Help &amp; Contact</a>
    <div class="r"><a href="/sell">Sell</a><a class="hide-s" href="#" data-soon>Watchlist</a><a href="/my">My bMarketX</a><a href="#" data-soon aria-label="Cart">🛒</a></div>
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
  const card = (i, k = 0) => `<a class="card" href="/itm/${i.id}">
    <div class="img">${i.images?.[0] ? picture(i.images[0], 500, `alt="" ${k < 8 ? 'fetchpriority="high"' : 'loading="lazy"'}`) : ''}<button class="heart" type="button" aria-label="Watch" onclick="event.preventDefault()">♡</button></div>
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

  window.BMX = { esc, usd, card, picture, after, api, pager, params, alertBar, priceReady, fillBsv, get usdPerBsv() { return usdPerBsv; } };
})();
