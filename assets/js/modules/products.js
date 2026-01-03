import { formatVND, parseRaw, escapeHtml } from '../core/utils.js';
import { state } from '../core/state.js';

export function initProducts({ RAW, FAV_INIT }) {
  state.PRODUCTS = RAW.map(([name, p]) => {
    if (typeof p === 'number') {
      return { name, variants: [{ key: 'd', label: 'D', price: p }] };
    }
    if (typeof p === 'object' && p !== null) {
      const variants = Object.keys(p).map(k => ({
        key: k,
        label: k.charAt(0).toUpperCase() + k.slice(1),
        price: p[k],
      }));
      return { name, variants };
    }
    return { name, variants: [{ key: 'd', label: 'D', price: 0 }] };
  });

  state.favorites = new Set((FAV_INIT || []).slice());
  state.filterFavsOnly = true;

  renderList();
  attachFavToggle();
  setupFormattedInputs(['ship_fee', 'discount']);
  calculateAll();
  updateFavCount();
  applyFilter();
}

function listRoot() {
  return document.getElementById('product-list');
}

function createItemElement(prod) {
  const { name, variants } = prod;
  const defaultVariant = variants[0];
  const item = document.createElement('div');
  item.className = 'item product-item';
  item.dataset.price = String(defaultVariant.price);
  item.dataset.name = name;

  const hasMultiple = variants.length > 1;
  const sizeHtml = hasMultiple ? `
    <div class="size-group" role="group" aria-label="Cỡ">
      ${variants.map((v,i)=>`<button type="button" class="size-btn" data-index="${i}" aria-pressed="${i===0?'true':'false'}">${v.label}</button>`).join('')}
    </div>
  ` : `<div class="size-group"><div class="size-btn" aria-pressed="true" style="cursor:default">${variants[0].label}</div></div>`;

  const isFav = state.favorites.has(name) ? 'true' : 'false';

  item.innerHTML = `
    <div class="thumb">Ảnh</div>
    <div class="meta">
      <div class="name">${escapeHtml(name)}</div>

      <div class="price-line">
        <div class="label-inline">Giá đơn vị</div>&nbsp;<div class="value price">${formatVND(defaultVariant.price)}</div>
      </div>

      <div style="display:flex; gap:8px; margin-top:6px; align-items:center">
        ${sizeHtml}
      </div>

      <div class="qty-row">
        <button class="btn-qty dec" aria-label="Giảm">−</button>
        <input type="number" min="0" class="qty-input" value="0" aria-label="Số lượng ${escapeHtml(name)}" inputmode="numeric" pattern="[0-9]*" />
        <button class="btn-qty inc" aria-label="Tăng">+</button>

        <div class="quick-qty" aria-hidden="true">
          <button type="button" class="quick-btn" data-val="2">2</button>
          <button type="button" class="quick-btn" data-val="5">5</button>
        </div>
      </div>
    </div>

    <div class="price-badge">0 ₫</div>
    <button class="fav-btn" aria-pressed="${isFav}" title="Thêm vào yêu thích">★</button>
  `;
  return item;
}

function renderList() {
  const root = listRoot();
  if (!root) return;
  root.innerHTML = '';
  state.PRODUCTS.forEach(prod => root.appendChild(createItemElement(prod)));

  document.querySelectorAll('.product-item').forEach(it => {
    const inc = it.querySelector('.inc');
    const dec = it.querySelector('.dec');
    const q = it.querySelector('.qty-input');
    const name = it.dataset.name;

    updateBadge(it);

    inc?.addEventListener('click', () => { q.value = Math.max(0, (parseInt(q.value||0)+1)); onQtyChange(); updateBadge(it); });
    dec?.addEventListener('click', () => { q.value = Math.max(0, (parseInt(q.value||0)-1)); onQtyChange(); updateBadge(it); });
    q?.addEventListener('input', () => { q.value = Math.max(0, parseInt(q.value||0) || 0); onQtyChange(); updateBadge(it); });

    it.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const add = parseInt(btn.dataset.val) || 0;
        q.value = Math.max(0, (parseInt(q.value||0) || 0) + add);
        onQtyChange();
        updateBadge(it);
      });
    });

    it.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-pressed') === 'true') return;
        const idx = Number(btn.dataset.index) || 0;
        it.querySelectorAll('.size-btn').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
        const prod = state.PRODUCTS.find(p => p.name === name);
        const variant = prod?.variants?.[idx] || prod?.variants?.[0];
        if (!variant) return;
        it.dataset.price = String(variant.price);
        it.querySelector('.price').textContent = formatVND(variant.price);
        updateBadge(it);
        calculateAll();
      });
    });
  });
}

function attachFavToggle() {
  document.querySelectorAll('.product-item').forEach(it => {
    const favBtn = it.querySelector('.fav-btn');
    const name = it.dataset.name;
    favBtn?.addEventListener('click', () => {
      const pressed = favBtn.getAttribute('aria-pressed') === 'true';
      if (pressed) {
        state.favorites.delete(name);
        favBtn.setAttribute('aria-pressed', 'false');
      } else {
        state.favorites.add(name);
        favBtn.setAttribute('aria-pressed', 'true');
      }
      updateFavCount();
      applyFilter();
    });
  });
}

export function applyFilter() {
  const root = listRoot();
  document.querySelectorAll('.product-item').forEach(item => {
    const isFav = state.favorites.has(item.dataset.name);
    if (state.filterFavsOnly) item.classList.toggle('hidden', !isFav);
    else item.classList.remove('hidden');
  });

  if (root) root.classList.toggle('single-column', state.filterFavsOnly && state.favorites.size > 0);
  calculateAll();
  updateFavCount();
}

export function updateFavCount() {
  const el = document.getElementById('favCount');
  if (el) el.textContent = String(state.favorites.size);
}

export function calculateAll() {
  let total = 0;
  let selectedCount = 0;

  document.querySelectorAll('.product-item').forEach(item => {
    if (state.filterFavsOnly && !state.favorites.has(item.dataset.name)) return;
    const price = parseRaw(item.dataset.price);
    const qty = parseInt(item.querySelector('.qty-input')?.value) || 0;
    if (qty > 0) selectedCount++;
    total += price * qty;
  });

  const shipEl = document.getElementById('ship_fee');
  const discountEl = document.getElementById('discount');
  const ship = shipEl ? parseRaw(shipEl.dataset.raw || shipEl.value) : 0;
  const discount = discountEl ? parseRaw(discountEl.dataset.raw || discountEl.value) : 0;

  const grand = total + ship - discount;
  const selectedEl = document.getElementById('selectedCount');
  if (selectedEl) selectedEl.textContent = String(selectedCount);
  const grandEl = document.getElementById('grandTotal');
  if (grandEl) grandEl.textContent = formatVND(Math.max(0, grand));

  document.querySelectorAll('.product-item').forEach(updateBadge);
}

export function collectInvoiceItems() {
  const items = [];
  document.querySelectorAll('.product-item').forEach(item => {
    if (item.classList.contains('hidden')) return;
    const name = item.dataset.name;
    const price = parseRaw(item.dataset.price);
    const qty = parseInt(item.querySelector('.qty-input')?.value || 0) || 0;
    if (qty > 0) items.push({ name, price, qty, subtotal: price * qty });
  });
  return items;
}

export function resetQuantities() {
  document.querySelectorAll('.product-item').forEach(item => {
    const q = item.querySelector('.qty-input');
    if (q) q.value = 0;
    updateBadge(item);
  });
  calculateAll();
}

function onQtyChange() {
  calculateAll();
}

function updateBadge(item) {
  const qtyInput = item.querySelector('.qty-input');
  if (!qtyInput) return;
  const price = parseRaw(item.dataset.price);
  const qty = parseInt(qtyInput.value) || 0;
  const badge = item.querySelector('.price-badge');
  if (!badge) return;
  badge.textContent = qty > 0 ? `${formatVND(price * qty)} ₫` : '0 ₫';
}

function setupFormattedInputs(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const n = parseRaw(el.value || el.dataset.raw);
    el.dataset.raw = n;
    el.value = formatVND(n);

    el.addEventListener('input', e => {
      const digits = (e.target.value || '').replace(/[^0-9]/g, '');
      const v = parseInt(digits) || 0;
      e.target.dataset.raw = v;
      e.target.value = formatVND(v);
      calculateAll();
    });

    el.addEventListener('focus', e => {
      e.target.value = String(e.target.dataset.raw || '0');
      setTimeout(() => { try { e.target.setSelectionRange(e.target.value.length, e.target.value.length); } catch {} }, 0);
    });

    el.addEventListener('blur', e => {
      const v = parseRaw(e.target.value) || parseRaw(e.target.dataset.raw);
      e.target.dataset.raw = v;
      e.target.value = formatVND(v);
      calculateAll();
    });
  });
}

