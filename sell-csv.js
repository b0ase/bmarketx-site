// Sell › Upload CSV: read an eBay listings CSV in the browser, show what we found, then send it in batches.
import { mapColumns, parseCsv, toItems } from '/lib/csv.js';

const { esc, api, usd } = window.BMX;
const out = document.getElementById('csvOut'), drop = document.getElementById('drop'), file = document.getElementById('file');
let found = null, signedIn = false;
fetch('/api/bwalletx/session', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { signedIn = !!j.identityKey; }).catch(() => {});
document.addEventListener('bmarketx-wallet', () => { signedIn = true; if (found) render(); });

drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) read(e.dataTransfer.files[0]); };
file.onchange = () => file.files[0] && read(file.files[0]);

async function read(f) {
  if (f.size > 20 * 1024 * 1024) { out.innerHTML = '<p class="err">That file is over 20 MB. Split it and upload each part.</p>'; return; }
  const rows = parseCsv(await f.text());
  const map = mapColumns(rows);
  if (!map) { out.innerHTML = '<p class="err">We couldn’t find a <b>Title</b> column. Is this the “All active listings” report from Seller Hub?</p>'; return; }
  if (map.missing) { out.innerHTML = `<p class="err">This file has no <b>${map.missing}</b> column, so we can’t list the items. Columns found: ${esc(map.head.join(', '))}</p>`; return; }
  found = { ...toItems(rows, map), fileName: f.name, map };
  render();
}

const guessHandle = (n) => String(n).toLowerCase().replace(/\.csv$/, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mystore';
function render() {
  const { items, skipped, currencies, fileName } = found;
  const noPics = items.filter((i) => !i.images.length).length;
  const qty = items.reduce((a, i) => a + i.quantity, 0), value = items.reduce((a, i) => a + i.priceCents * i.quantity, 0);
  out.innerHTML = `
    <div class="note" style="margin-top:16px"><b>${items.length.toLocaleString()} listings found</b> in ${esc(fileName)} · ${qty.toLocaleString()} items in stock · ${usd(value)} total at your prices
      ${skipped.length ? `<br><span class="err">${skipped.length} rows skipped</span> <span class="muted">(${esc(summary(skipped))})</span>` : ''}
      ${currencies.some((c) => c !== 'USD') ? `<br><span class="err">Prices are in ${esc(currencies.join(', '))}.</span> bMarketX prices are in US dollars for now, so check them after the move.` : ''}
      ${noPics ? `<br><span class="muted">${noPics.toLocaleString()} listings have no photo link in this file. eBay’s active-listings report leaves photos out; add them after the move, or use the Store link tab to copy them.</span>` : ''}
    </div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th></th><th>Title</th><th>Condition</th><th class="n">Qty</th><th class="n">Price</th></tr></thead><tbody>
      ${items.slice(0, 200).map((i) => `<tr><td>${i.images[0] ? `<img src="${esc(i.images[0])}" alt="" style="width:40px;height:40px;object-fit:contain">` : ''}</td><td>${esc(i.title)}${i.sku ? `<div class="muted">${esc(i.sku)}</div>` : ''}</td><td>${esc(i.condition || '')}</td><td class="n">${i.quantity}</td><td class="n">${usd(i.priceCents)}</td></tr>`).join('')}
    </tbody></table></div>
    ${items.length > 200 ? `<p class="muted">Showing the first 200 of ${items.length.toLocaleString()}.</p>` : ''}
    <div class="form2">
      <label>Store name<input id="sName" value="${esc(found.name || '')}" placeholder="Moisty Collectibles" maxlength="80"></label>
      <label>Store address<div class="pre"><span>bmarketx.com/str/</span><input id="sHandle" value="${esc(found.handle || window.BMX_PREHANDLE || guessHandle(fileName))}" maxlength="64"></div></label>
    </div>
    <div id="go"></div>`;
  ['sName', 'sHandle'].forEach((id) => document.getElementById(id).oninput = (e) => { found[id === 'sName' ? 'name' : 'handle'] = e.target.value; });
  const go = document.getElementById('go');
  if (!signedIn) {
    go.innerHTML = BMX.signInBox('Sign in with bWalletX to move your store.');
    return;
  }
  go.innerHTML = `<button class="btn" id="send">Move ${items.length.toLocaleString()} listings to bMarketX</button>`;
  document.getElementById('send').onclick = send;
}
function summary(sk) {
  const by = {}; sk.forEach((s) => (by[s.why] = (by[s.why] || 0) + 1));
  return Object.entries(by).map(([w, n]) => `${n} ${w}`).join(', ');
}

async function send() {
  const handle = document.getElementById('sHandle').value.trim().toLowerCase();
  const displayName = document.getElementById('sName').value.trim();
  const go = document.getElementById('go');
  go.innerHTML = `<div class="prog"><i id="bar"></i></div><p class="muted" id="msg">Starting…</p>`;
  const bar = document.getElementById('bar'), msg = document.getElementById('msg');
  const all = found.items; let n = 0;
  try {
    for (let k = 0; k < all.length; k += 500) {
      const r = await api('/api/import/csv', { method: 'POST', body: JSON.stringify({ handle, displayName, items: all.slice(k, k + 500) }) });
      n += r.imported;
      bar.style.width = Math.round(Math.min(1, (k + 500) / all.length) * 100) + '%';
      msg.textContent = `${n.toLocaleString()} of ${all.length.toLocaleString()} listings moved`;
    }
    BMX.track('listings_imported', { n });
    go.innerHTML = `<div class="note"><b>Your store is live.</b> ${n.toLocaleString()} listings moved.
      It shows as <b>not yet verified</b> until you prove your eBay store on the Store link tab, which also carries over your feedback.</div>
      <p><a class="btn" href="/str/${esc(handle)}">Open my bMarketX store</a></p>`;
  } catch (e) {
    go.innerHTML = `<p class="err">${esc(e.message)}</p><p class="muted">${n.toLocaleString()} listings were moved before this. Fix it and send again: listings with an eBay item number update in place.</p><button class="btn" id="send">Try again</button>`;
    document.getElementById('send').onclick = send;
  }
}
