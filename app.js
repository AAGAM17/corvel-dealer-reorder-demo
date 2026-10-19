const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + n.toFixed(2);

// ---- state: in memory, persisted to localStorage when it is available ----
const KEY = 'corvel-demo-v1';
const blank = { dealer: '', cart: {}, notes: '', date: '', orders: [] };
let state = { ...blank };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* storage blocked or corrupt: start empty */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* keep going in memory */ } };

let DATA = null, pending = null, filter = { q: '', cat: 'All' };
const prod = id => DATA.products.find(p => p.id === id);
const units = () => Object.values(state.cart).reduce((a, b) => a + b, 0);
const linesOf = cart => Object.entries(cart).map(([id, qty]) => ({ ...prod(id), qty })).filter(l => l.name && l.qty > 0);
const sum = lines => lines.reduce((a, l) => a + l.price * l.qty, 0);
const setQty = (id, q) => { q = Math.max(0, Math.min(99, q)); if (q) state.cart[id] = q; else delete state.cart[id]; save(); };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

let toastT;
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); };

const ICONS = {
  catalogue: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  reorder: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
  orders: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
};
const TABS = [['catalogue', 'Catalogue'], ['reorder', 'Reorder'], ['cart', 'Cart'], ['orders', 'Orders'], ['about', 'About']];

const stepper = (id, q) => q
  ? `<div class="stepper" role="group" aria-label="Quantity"><button data-act="dec" data-id="${id}" aria-label="Fewer">−</button><output>${q}</output><button data-act="inc" data-id="${id}" aria-label="More">+</button></div>`
  : `<button class="add" data-act="inc" data-id="${id}">Add</button>`;

// ---- screens ----
const screens = {
  login: () => `<div class="login"><img src="icon.svg" alt=""><p class="eyebrow">Dealer portal</p><h1>Corvel<br>reorder</h1>
    <p class="sub">Reorder stock from your phone.</p>
    <form id="login"><label class="field">Dealer code<input name="code" autocomplete="off" autocapitalize="characters" placeholder="e.g. D-1042"></label>
    <p class="muted" style="margin-top:8px">Demo: enter any code</p>
    <button class="btn">Sign in</button></form></div>`,

  catalogue: () => `<p class="eyebrow">Dealer ${esc(state.dealer)}</p><h1>Catalogue</h1>
    <label class="field" style="margin:12px 0 0">Search<input id="q" type="search" value="${esc(filter.q)}" placeholder="Search products"></label>
    <div class="chips" id="chips"></div><div id="list"></div>`,

  reorder: () => {
    const lines = DATA.usual.map(u => ({ ...prod(u.id), qty: u.qty }));
    return `<p class="eyebrow">From your history</p><h1>Your usual order</h1><p class="sub">Based on sample order history.</p>
      ${lines.map(l => `<div class="card"><div class="row"><div><h3>${l.qty} × ${esc(l.name)}</h3><p class="muted">${l.pack}</p></div><div class="price">${money(l.price * l.qty)}<br><small>demo price</small></div></div></div>`).join('')}
      <div class="total"><span>Total</span><span>${money(sum(lines))}</span></div>
      <button class="btn" id="addall">Add all to cart</button>`;
  },

  cart: () => {
    const lines = linesOf(state.cart);
    if (!lines.length) return `<h1>Cart</h1><div class="empty"><p>Your cart is empty.</p><a class="btn alt" href="#/catalogue">Browse catalogue</a></div>`;
    if (!state.date) { state.date = inDays(3); save(); }
    return `<h1>Cart</h1><p class="sub">${units()} packs</p>
      ${lines.map(l => `<div class="card"><div class="row"><div><h3>${esc(l.name)}</h3><p class="muted">${l.pack} · ${money(l.price)} <span>(demo price)</span></p></div>${stepper(l.id, l.qty)}</div></div>`).join('')}
      <label class="field">Delivery date<input id="date" type="date" min="${inDays(1)}" value="${state.date}"></label>
      <label class="field">Notes for the supplier<textarea id="notes" rows="3" placeholder="Gate code, dock hours, anything else">${esc(state.notes)}</textarea></label>
      <div class="total"><span>Order total</span><span>${money(sum(lines))}</span></div>
      <p class="muted">Demo prices, for illustration only.</p>
      <a class="btn" href="#/place">Review and place order</a>`;
  },

  place: () => {
    const lines = linesOf(state.cart);
    if (!lines.length) { location.hash = '#/cart'; return ''; }
    const d = new Date(), no = `CRV-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    if (!pending || pending.sig !== JSON.stringify([state.cart, state.notes, state.date])) pending = { sig: JSON.stringify([state.cart, state.notes, state.date]), no, lines, total: sum(lines), date: state.date, notes: state.notes };
    const wa = 'https://wa.me/?text=' + encodeURIComponent(message(pending));
    return `<p class="eyebrow">Step 2 of 2</p><h1>Place order</h1><p class="sub">Order ${pending.no}</p>
      <div class="card">${pending.lines.map(l => `<div class="line"><span>${l.qty} × ${esc(l.name)}</span><span>${money(l.price * l.qty)}</span></div>`).join('')}
      <div class="total"><span>Total (demo prices)</span><span>${money(pending.total)}</span></div></div>
      <div class="card"><div class="line"><span>Delivery</span><strong>${esc(pending.date)}</strong></div>${pending.notes ? `<div class="line"><span>Notes</span><span>${esc(pending.notes)}</span></div>` : ''}</div>
      <p class="muted" style="margin-top:12px">This opens WhatsApp with your order typed in. You still press send there. This demo can't see whether the message is sent.</p>
      <a class="btn" id="wa" href="${wa}" target="_blank" rel="noopener">Send via WhatsApp</a>
      <a class="btn alt" href="#/cart">Back to cart</a>`;
  },

  sent: no => {
    const o = state.orders.find(x => x.no === no);
    return `<div class="empty" style="color:var(--ink)"><div class="big-ok">✓</div><h1 style="margin-top:12px">Order sent via WhatsApp</h1>
      <p class="sub" style="margin-top:8px">WhatsApp was opened with order ${esc(no)}${o ? ` (${money(o.total)}, demo prices)` : ''}.</p>
      <p class="muted">This demo can't confirm that the supplier received it. Check the message in WhatsApp.</p>
      <a class="btn" href="#/orders">View orders</a><a class="btn alt" href="#/catalogue">Back to catalogue</a></div>`;
  },

  orders: () => {
    const all = [...state.orders, ...DATA.history.map(h => ({ ...h, total: sum(linesOf(Object.fromEntries(h.lines.map(l => [l.id, l.qty])))) }))];
    return `<h1>Orders</h1><p class="sub">Sample history plus orders placed here.</p>` + all.map(o => `<details class="card"><summary><span>${esc(o.no)}<br><span class="muted">${esc(o.date)} · ${money(o.total)}</span></span><span class="status ${o.sent ? 'sent' : ''}">${esc(o.status)}</span></summary>
      <div style="margin-top:8px">${o.lines.map(l => `<div class="line"><span>${l.qty} × ${esc(prod(l.id)?.name || l.name)}</span></div>`).join('')}</div></details>`).join('');
  },

  about: () => `<p class="eyebrow">Next steps</p><h1>How this would work for your business</h1><p class="sub">This demo uses sample data and no backend. A real version could add:</p>
    ${[['Admin panel', 'Staff manage products, prices, dealers and incoming orders in one place.'],
       ['Live stock', 'Dealers see what is in stock before they order, updated from your inventory.'],
       ['Invoices', 'Each order produces an invoice dealers can download from the app.'],
       ['Payment links', 'Dealers pay an invoice from their phone through a payment link.']]
      .map(([t, d]) => `<div class="card"><h3>${t}</h3><p class="muted" style="margin-top:4px">${d}</p></div>`).join('')}
    <button class="btn alt" id="logout">Sign out</button>`,
};

const message = o => [
  `Order ${o.no} (demo)`, `Dealer code: ${state.dealer}`, `Delivery date: ${o.date}`, '', 'Items:',
  ...o.lines.map(l => `- ${l.qty} × ${l.name} (${l.pack}) = ${money(l.price * l.qty)}`),
  `Total (demo prices): ${money(o.total)}`, o.notes ? `\nNotes: ${o.notes}` : '', '\nSent from the Corvel demo app',
].join('\n');

// ---- list + badge updates without re-rendering the whole screen ----
function drawList() {
  const q = filter.q.trim().toLowerCase();
  const items = DATA.products.filter(p => (filter.cat === 'All' || p.category === filter.cat) && p.name.toLowerCase().includes(q));
  $('#list').innerHTML = items.map(p => `<div class="card"><div class="row"><div><h3>${esc(p.name)}</h3><p class="muted">${p.pack}</p>
    <p class="price">${money(p.price)} <small>demo price</small></p></div>${stepper(p.id, state.cart[p.id] || 0)}</div></div>`).join('') || '<p class="empty">No products match.</p>';
  $('#chips').innerHTML = ['All', ...DATA.categories].map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${filter.cat === c}">${esc(c)}</button>`).join('');
}
const drawBadge = () => { const b = $('#tabs .badge'); if (b) b.textContent = units() || ''; };

// ---- router ----
function render() {
  const [route, arg] = location.hash.slice(2).split('/');
  const name = state.dealer ? (screens[route] ? route : 'catalogue') : 'login';
  const view = $('#view');
  view.innerHTML = `<div class="screen">${screens[name](arg)}</div>`;
  window.scrollTo(0, 0);
  const tabs = $('#tabs');
  tabs.hidden = name === 'login';
  tabs.innerHTML = TABS.map(([id, label]) => `<a href="#/${id}" ${id === name || (name === 'place' && id === 'cart') ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg>${label}${id === 'cart' ? `<span class="badge">${units() || ''}</span>` : ''}</a>`).join('');
  if (name === 'catalogue') drawList();
}

// ---- events (delegated: one listener per kind) ----
document.addEventListener('click', e => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.act) {
    const id = t.dataset.id, q = (state.cart[id] || 0) + (t.dataset.act === 'inc' ? 1 : -1);
    setQty(id, q);
    // cart screen: removing a line changes the whole page; elsewhere only the list
    return $('#list') ? (drawList(), drawBadge()) : render();
  }
  if (t.dataset.cat) { filter.cat = t.dataset.cat; drawList(); }
  if (t.id === 'addall') { DATA.usual.forEach(u => setQty(u.id, (state.cart[u.id] || 0) + u.qty)); toast('Added your usual order'); location.hash = '#/cart'; }
  if (t.id === 'logout') { state.dealer = ''; save(); location.hash = '#/login'; render(); }
  if (t.id === 'wa') { // the link opens WhatsApp itself; we record the order once it is opened
    const o = { no: pending.no, date: ymd(new Date()), status: 'Sent via WhatsApp (unconfirmed)', sent: true, total: pending.total, lines: pending.lines.map(l => ({ id: l.id, qty: l.qty, name: l.name })) };
    state.orders.unshift(o); state.cart = {}; state.notes = ''; state.date = ''; pending = null; save();
    setTimeout(() => { location.hash = '#/sent/' + o.no; }, 400);
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { filter.q = e.target.value; drawList(); }
  if (e.target.id === 'notes') { state.notes = e.target.value; save(); }
  if (e.target.id === 'date') { state.date = e.target.value; save(); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  state.dealer = new FormData(e.target).get('code').trim() || 'DEMO'; save();
  location.hash = '#/catalogue'; render();
});
window.addEventListener('hashchange', render);

// ---- boot ----
fetch('data.json').then(r => r.json()).then(d => { DATA = d; render(); })
  .catch(() => { $('#view').innerHTML = '<div class="empty">Could not load the catalogue. Check your connection and reload.</div>'; });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
