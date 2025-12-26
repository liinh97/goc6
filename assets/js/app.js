// assets/js/app.js
// Main app (module) — imports firebase-client as module
import * as FB from './firebase-client.js';

// --- Thêm đoạn này: cấu hình và init Firebase (chỉ 1 lần) ---
const firebaseConfig = {
  apiKey: "AIzaSyAc6yCnkNHJAHPCh70mM8lt2hixca2gZqI",
  authDomain: "goc6-f82e7.firebaseapp.com",
  projectId: "goc6-f82e7",
  storageBucket: "goc6-f82e7.appspot.com", // <-- bắt buộc đúng định dạng
  messagingSenderId: "115228381542",
  appId: "1:115228381542:web:4a082d4056974ee11b38a7",
  measurementId: "G-TFMHB4DZNZ"
};

// Init (no-op nếu đã init)
FB.initFirebase(firebaseConfig);

/* =========================
   GLOBAL STATE
========================= */
let currentInvoiceId = null;
let editingInvoiceData = null; // giữ raw data invoice (optional)
let invoiceUIMode = 'create'; 

// ===== GLOBAL FILTER STATE =====
const invoiceFilters = {
  status: 'all',   // all | 1 | 2 | 3
  date: null,      // yyyy-mm-dd
  limit: 10,
  page: 1,
};

const invoicePaging = {
  cursorStack: [],
  currentCursor: null,
};

document.addEventListener('DOMContentLoaded', function () {

  let UI_MODE = 'items';
  let invoiceLoadedOnce = false;

  async function setUIMode(mode) {
    document.body.classList.remove('mode-items', 'mode-invoices');
    document.body.classList.add(`mode-${mode}`);

    if (mode === 'invoices') {
      if (!invoiceLoadedOnce) {
        invoiceLoadedOnce = true;
        await renderInvoiceList();
      }
    }
  }

  // ----- Data + init -----
  const RAW = [
    ["Nem TCC",3800],
    ["Nem TCC xù", {Chín:6500, Sống:4000}],
    ["Nem TCC vỏ giòn", {Chín:7000, Sống:5000}],
    ["Nem TCC phomai", {Chín:13000, Sống:11000}],
    ["Bánh rán mặn",8000],
    ["Bánh rán phomai",8000],
    ["Khoai tây chiên",35000],
    ["Trà chanh",15000],
    ["Bánh xèo nhật chay", {Nhỏ:30000, To:60000}],
    ["Gà chiên mắm",35000],
    ["Chân gà rút xương",80000],
    ["Thịt chưng mắm tép",35000],
    ["Salad",40000],
    ["Bún thang chay",45000],
    ["Xôi nấm",45000],
    ["Cốt chay",35000],
    ["Mọc chay",11000],
    ["Giò nấm chay",11000],
    ["Chả cốm chay",12000],
    ["Ruốc nấm",35000],
    ["Xôi cốm",18000],
    ["Chạo chay",40000],
    ["Cốm xào",18000],
    ["Canh mọc chay",60000],
  ];

  const PRODUCTS = RAW.map(entry => {
    const [name, p] = entry;
    if (typeof p === 'number') {
      return { name, variants: [{ key:'d', label: 'D', price: p }] };
    } else if (typeof p === 'object' && p !== null) {
      const variants = Object.keys(p).map(k => ({ key:k, label: k.charAt(0).toUpperCase() + k.slice(1), price: p[k] }));
      return { name, variants };
    } else {
      return { name, variants: [{ key:'d', label: 'D', price: 0 }] };
    }
  });

  const FAV_INIT = ["Bánh rán mặn", "Bánh rán phomai", "Nem TCC xù", "Nem TCC vỏ giòn", "Nem TCC phomai", "Chân gà rút xương", "Khoai tây chiên", "Trà chanh"];
  let favorites = new Set(FAV_INIT.slice());
  let filterFavsOnly = true;

  function formatVND(num) { if (!isFinite(num)) return '0'; return new Intl.NumberFormat('vi-VN').format(num); }
  function parseRaw(val) { if (val == null) return 0; if (typeof val === 'string') { const cleaned = val.replace(/[^0-9\-]/g,''); return parseInt(cleaned) || 0; } return Number(val) || 0; }

  const listRoot = document.getElementById('product-list');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modal = document.getElementById('modal');

  // ----- Render list -----
  function createItemElement(prod){
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

    const isFav = favorites.has(name) ? 'true' : 'false';

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

          <!-- quick qty buttons -->
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

  function renderList(){
    if (!listRoot) return;
    listRoot.innerHTML = '';
    PRODUCTS.forEach(prod => { listRoot.appendChild(createItemElement(prod)); });

    document.querySelectorAll('.item').forEach(it=>{
      const inc = it.querySelector('.inc');
      const dec = it.querySelector('.dec');
      const q = it.querySelector('.qty-input');
      const favBtn = it.querySelector('.fav-btn');
      const name = it.dataset.name;
      const priceNode = it.querySelector('.price');
      const priceBadge = it.querySelector('.price-badge');
      const sizeBtns = it.querySelectorAll('.size-btn');
      const quickBtns = it.querySelectorAll('.quick-btn');

      // initial badge show 0
      updateBadge(it);

      // qty handlers
      if (inc) inc.addEventListener('click', ()=>{ q.value = Math.max(0, parseInt(q.value||0)+1); onQtyChange(it); updateBadge(it); });
      if (dec) dec.addEventListener('click', ()=>{ q.value = Math.max(0, parseInt(q.value||0)-1); onQtyChange(it); updateBadge(it); });
      if (q) q.addEventListener('input', ()=>{ q.value = Math.max(0, parseInt(q.value||0) || 0); onQtyChange(it); updateBadge(it); });

      // quick qty handlers (ADD to the existing quantity)
      if(quickBtns && quickBtns.length){
        quickBtns.forEach(btn=>{
          btn.addEventListener('click', (e)=>{
            const add = parseInt(btn.dataset.val) || 0;
            const current = Math.max(0, parseInt(q.value||0) || 0);
            const newVal = current + add;
            q.value = newVal;
            onQtyChange(it);
            updateBadge(it);
            try { q.focus(); q.setSelectionRange(String(q.value).length, String(q.value).length); } catch(_) {}
          });
        });
      }

      // favorite toggle
      if (favBtn) {
        favBtn.addEventListener('click', ()=>{ 
          const pressed = favBtn.getAttribute('aria-pressed') === 'true';
          if(pressed){ favorites.delete(name); favBtn.setAttribute('aria-pressed','false'); }
          else { favorites.add(name); favBtn.setAttribute('aria-pressed','true'); }
          updateFavCount(); applyFilter();
        });
      }

      // size buttons behave like radio
      if(sizeBtns && sizeBtns.length){
        sizeBtns.forEach(btn=>{
          btn.addEventListener('click', (e)=>{
            if(btn.getAttribute('aria-pressed') === 'true') return;
            const idx = Number(btn.dataset.index) || 0;
            sizeBtns.forEach(b=> b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
            const prod = PRODUCTS.find(p => p.name === name);
            if(!prod) return;
            const variant = prod.variants[idx] || prod.variants[0];
            it.dataset.price = String(variant.price);
            if(priceNode) priceNode.textContent = formatVND(variant.price);
            updateBadge(it);
            calculateAll();
          });
        });
      }
    });

    calculateAll();
    updateFavCount();
    applyFilter();
  }

  function updateBadge(item){
    if (!item.classList.contains('product-item')) return;

    const qtyInput = item.querySelector('.qty-input');
    if (!qtyInput) return;

    const price = parseRaw(item.dataset.price);
    const qty = parseInt(qtyInput.value) || 0;

    const badge = item.querySelector('.price-badge');
    if(!badge) return;

    badge.textContent =
      qty > 0 ? formatVND(price * qty) + ' ₫' : '0 ₫';
  }

  document.getElementById('showInvoicesBtn').onclick=()=>setUIMode('invoices');
  document.getElementById('collapseBtn').onclick=()=>setUIMode('items');

  // ----- Init and handlers -----
  function init(){
    renderList();

    setUIMode('items');

    // Hoá đơn button -> open modal
    const collapseBtn = document.getElementById('collapseBtn');
    if (collapseBtn) collapseBtn.addEventListener('click', openCompactPopup);

    const closeModalBtn = document.getElementById('closeModal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

    // Reset button -> zero all quantities
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', ()=>{ resetQuantities(); });

    // close modal by clicking backdrop (outside modal)
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          closeModal();
        }
      });
    }

    // also allow Esc key to close modal
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && modalBackdrop && modalBackdrop.style.display === 'flex') {
        closeModal();
      }
    });

    const showFavsBtn = document.getElementById('showFavsBtn');
    if (showFavsBtn) {
      // init state
      showFavsBtn.classList.toggle('active', filterFavsOnly);
      showFavsBtn.setAttribute('aria-pressed', String(filterFavsOnly));
      applyFilter();

      showFavsBtn.addEventListener('click', () => {

        const isInInvoices = document.body.classList.contains('mode-invoices');

        if (isInInvoices) {
          setUIMode('items');
          filterFavsOnly = true;
        } else {
          filterFavsOnly = !filterFavsOnly;
        }

        showFavsBtn.classList.toggle('active', filterFavsOnly);
        showFavsBtn.setAttribute('aria-pressed', String(filterFavsOnly));
        applyFilter();
      });
    }

    // Payment controls: radio change + cash input setup
    document.querySelectorAll('input[name="payment_method"]').forEach(r=>{
      r.addEventListener('change', onPaymentMethodChange);
    });

    ['ship_fee','discount'].forEach(id=>{
      const el=document.getElementById(id);
      if (!el) return;
      const n=parseRaw(el.value||el.dataset.raw);
      el.dataset.raw=n;
      el.value=formatVND(n);
      setupFormattedInput(id);
    });

    // setup cash input formatting & events
    setupCashInput();

    // attach save handler here (after modal exists)
    attachSaveHandler();
  }

  function resetQuantities(){
    document.querySelectorAll('.item').forEach(item=>{
      const q = item.querySelector('.qty-input');
      if(q){
        q.value = 0;
        updateBadge(item);
      }
    });
    calculateAll();
  }

  function onQtyChange(item){
    calculateAll();
  }

  function calculateAll(){
    let total = 0;
    let selectedCount = 0;
    document.querySelectorAll('.product-item').forEach(item=>{
      if(filterFavsOnly && !favorites.has(item.dataset.name)) return;
      const price = parseRaw(item.dataset.price);
      const qty = parseInt(item.querySelector('.qty-input').value)||0;
      const subtotal = price * qty;
      if(qty>0) selectedCount++;
      total += subtotal;
    });

    const shipEl = document.getElementById('ship_fee');
    const discountEl = document.getElementById('discount');
    const ship = shipEl ? parseRaw(shipEl.dataset.raw || shipEl.value) : 0;
    const discount = discountEl ? parseRaw(discountEl.dataset.raw || discountEl.value) : 0;

    const grand = total + ship - discount;
    const selCountEl = document.getElementById('selectedCount');
    const grandTotalEl = document.getElementById('grandTotal');
    if (selCountEl) selCountEl.textContent = String(selectedCount);
    if (grandTotalEl) grandTotalEl.textContent = formatVND(Math.max(0, grand));
    // update badges in case QTY changed
    document.querySelectorAll('.item').forEach(updateBadge);
  }

  function setupFormattedInput(id){
    const el=document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',e=>{
      const digits=(e.target.value||'').replace(/[^0-9]/g,'');
      const n=parseInt(digits)||0;
      e.target.dataset.raw=n;
      e.target.value=formatVND(n);
      calculateAll();
    });
    el.addEventListener('focus',e=>{
      e.target.value=String(e.target.dataset.raw||'0');
      setTimeout(()=>{try{e.target.setSelectionRange(e.target.value.length, e.target.value.length)}catch(err){}},0)
    });
    el.addEventListener('blur',e=>{
      const n=parseRaw(e.target.value)||parseRaw(e.target.dataset.raw); e.target.dataset.raw=n; e.target.value=formatVND(n); calculateAll();
    });
  }

  function applyFilter(){
    const anyFavs = favorites.size > 0;
    document.querySelectorAll('.product-item').forEach(item=>{
      const isFav = favorites.has(item.dataset.name);
      if(filterFavsOnly){
        if(!isFav) item.classList.add('hidden'); else item.classList.remove('hidden');
      } else {
        item.classList.remove('hidden');
      }
    });

    if(filterFavsOnly && anyFavs) listRoot.classList.add('single-column'); else listRoot.classList.remove('single-column');

    calculateAll();
    updateFavCount();
  }

  function updateFavCount(){ const favCountEl = document.getElementById('favCount'); if (favCountEl) favCountEl.textContent = String(favorites.size); }

  function openCompactPopup(){
    const listEl=document.getElementById('compactList'); if (!listEl) return; listEl.innerHTML='';
    let total=0; let count=0;
    document.querySelectorAll('.product-item').forEach(item=>{
      if(item.classList.contains('hidden')) return;
      const name=item.querySelector('.name').textContent.trim();
      const price=parseRaw(item.dataset.price);
      const qty=parseInt(item.querySelector('.qty-input').value)||0;
      if(qty>0){
        count++;
        const subtotal=price*qty; total+=subtotal;
        const row=document.createElement('div'); row.className='line';
        row.innerHTML=`<div style="flex:1">${count}. ${escapeHtml(name)}  x${qty}</div><div style="min-width:90px; text-align:right">${formatVND(subtotal)} ₫</div>`;
        listEl.appendChild(row);
      }
    });

    const shipEl = document.getElementById('ship_fee');
    const discountEl = document.getElementById('discount');
    const ship = shipEl ? parseRaw(shipEl.dataset.raw||shipEl.value) : 0;
    const discount = discountEl ? parseRaw(discountEl.dataset.raw||discountEl.value) : 0;
    const modalShipEl = document.getElementById('modal_ship');
    const modalDiscountEl = document.getElementById('modal_discount');
    const modalTotalEl = document.getElementById('modal_total');
    if (modalShipEl) modalShipEl.textContent = formatVND(ship) + 'đ';
    if (modalDiscountEl) modalDiscountEl.textContent = formatVND(discount) + 'đ';
    const grand = Math.max(0, total + ship - discount);
    if (modalTotalEl) modalTotalEl.textContent = formatVND(grand) + 'đ';

    // prepare payment area
    const checked = document.querySelector('input[name="payment_method"]:checked');
    const selectedMethod = checked ? checked.value : 'qr';
    updatePaymentUI(selectedMethod, grand);

    // If QR chosen, trigger API call to generate QR and render it
    if(selectedMethod === 'qr' && grand > 0){
      showQRCodeForAmount(grand);
    } else {
      clearQrContainer();
    }

    if(count===0 && listEl) { listEl.innerHTML='<div class="muted">Chưa có món nào được chọn.</div>'; }

    if (modalBackdrop) modalBackdrop.style.display = 'flex';

    document.getElementById('saveInvoiceBtn').style.display = 'block';

    const closeBtn = document.getElementById('closeModal');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal(){
    const cashIn = document.getElementById('cash_given');
    if(cashIn){ cashIn.dataset.raw = 0; cashIn.value = formatVND(0); }
    const changeDue = document.getElementById('change_due');
    if (changeDue) changeDue.textContent = formatVND(0) + 'đ';
    if (modalBackdrop) modalBackdrop.style.display = 'none';
    clearQrContainer();
    hideQrError();
  }

  function escapeHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Payment UI handlers
  function onPaymentMethodChange(e){
    const method = e.target.value;
    const totalText = document.getElementById('modal_total')?.textContent || '0';
    const total = parseRaw(totalText);
    updatePaymentUI(method, total);

    if(method === 'qr' && total > 0){
      showQRCodeForAmount(total);
    } else {
      clearQrContainer();
      hideQrError();
    }
  }

  function updatePaymentUI(method, totalAmount){
    const qrC = document.getElementById('qrContainer');
    const cashC = document.getElementById('cashContainer');
    if(method === 'qr'){
      if (qrC) { qrC.classList.remove('hidden'); qrC.setAttribute('aria-hidden', 'false'); }
      if (cashC) { cashC.classList.add('hidden'); cashC.setAttribute('aria-hidden', 'true'); }
      const cashIn = document.getElementById('cash_given');
      if(cashIn){ cashIn.dataset.raw = 0; cashIn.value = formatVND(0); }
      const changeDue = document.getElementById('change_due');
      if (changeDue) changeDue.textContent = formatVND(0) + 'đ';
    } else {
      if (qrC) { qrC.classList.add('hidden'); qrC.setAttribute('aria-hidden', 'true'); }
      if (cashC) { cashC.classList.remove('hidden'); cashC.setAttribute('aria-hidden', 'false'); }
      recalcChangeFromCash(totalAmount);
    }
  }

  function setupCashInput(){
    const el = document.getElementById('cash_given');
    if(!el) return;
    el.dataset.raw = parseRaw(el.value || el.dataset.raw);
    el.value = formatVND(parseRaw(el.dataset.raw));
    el.addEventListener('input', e=>{
      const digits=(e.target.value||'').replace(/[^0-9]/g,'');
      const n=parseInt(digits)||0;
      e.target.dataset.raw=n;
      e.target.value=formatVND(n);
      const totalText = document.getElementById('modal_total')?.textContent || '0';
      const total = parseRaw(totalText);
      recalcChangeFromCash(total);
    });
    el.addEventListener('focus', e=>{
      e.target.value=String(e.target.dataset.raw||'0');
      setTimeout(()=>{try{e.target.setSelectionRange(e.target.value.length, e.target.value.length)}catch(err){}},0)
    });
    el.addEventListener('blur', e=>{
      const n=parseRaw(e.target.value)||parseRaw(e.target.dataset.raw); e.target.dataset.raw=n; e.target.value=formatVND(n);
      const totalText = document.getElementById('modal_total')?.textContent || '0';
      const total = parseRaw(totalText);
      recalcChangeFromCash(total);
    });
  }

  function recalcChangeFromCash(total){
    const el = document.getElementById('cash_given');
    const given = el ? parseRaw(el.dataset.raw || el.value) : 0;
    const change = Math.max(0, given - (total || 0));
    const changeDue = document.getElementById('change_due');
    if (changeDue) changeDue.textContent = formatVND(change) + 'đ';
  }

  // ----- QR generation / API call -----
  const VIETQR_ENDPOINT = 'https://api.vietqr.io/v2/generate';
  const VIETQR_CLIENT_ID = '3a7b7288-956c-46fa-a68e-4e641c564f42';
  const VIETQR_API_KEY = 'd565ed27-724a-4618-a2ef-ea9822bc9efe';

  async function showQRCodeForAmount(amount) {
    const qrC = document.getElementById('qrContainer');
    const errBox = document.getElementById('qrError');
    hideQrError();

    if (qrC) qrC.innerHTML = '';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    if (qrC) qrC.appendChild(spinner);

    try {
      const body = {
        accountNo: 1052949583,
        accountName: "NGO THI THUY",
        acqId: 970436,
        amount: amount,
        addInfo: "chuyen tien bang qr",
        format: "text",
        template: "compact"
      };

      const res = await fetch(VIETQR_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': VIETQR_CLIENT_ID,
          'x-api-key': VIETQR_API_KEY
        },
        body: JSON.stringify(body)
      });

      if(!res.ok){
        const txt = await res.text().catch(()=>res.statusText || 'Error');
        throw new Error(`API lỗi: ${res.status} ${txt}`);
      }

      const json = await res.json();
      const qrDataURL = json?.data?.qrDataURL;
      const qrCodeText = json?.data?.qrCode;

      if(qrDataURL && qrC){
        qrC.innerHTML = `<img src="${qrDataURL}" alt="QR code" style="max-width:100%; max-height:100%; border-radius:6px; object-fit:contain" />`;
        qrC.setAttribute('aria-label','Mã QR để quét');
      } else if (qrCodeText && qrC) {
        qrC.innerHTML = `<img src="https://chart.googleapis.com/chart?cht=qr&chs=500x500&chl=${encodeURIComponent(qrCodeText)}" alt="QR code" style="max-width:100%; max-height:100%; border-radius:6px; object-fit:contain" />`;
      } else {
        throw new Error('Không nhận được dữ liệu QR từ server.');
      }
    } catch (err) {
      console.error('QR generation error:', err);
      if (qrC) qrC.innerHTML = '';
      showQrError(String(err.message || err));
    }
  }

  function clearQrContainer(){
    const qrC = document.getElementById('qrContainer');
    if(qrC){
      qrC.innerHTML = '';
    }
  }

  function showQrError(msg){
    const errBox = document.getElementById('qrError');
    if (errBox) {
      errBox.textContent = 'Không tạo được mã QR: ' + msg;
      errBox.classList.remove('hidden');
    }
    const qrC = document.getElementById('qrContainer');
    if (qrC) qrC.innerHTML = `<div class="muted" style="text-align:center">Mã QR không khả dụng</div>`;
  }

  function hideQrError(){
    const errBox = document.getElementById('qrError');
    if (errBox) {
      errBox.textContent = '';
      errBox.classList.add('hidden');
    }
  }

  // helper: sanitize filename
  function sanitizeFilename(name){
    return String(name || '').replace(/[^a-z0-9_\-\.]/gi, '_').slice(0, 120);
  }

  // helper: collect invoice items + subtotal
  function collectInvoiceItems(){
    const items = [];
    document.querySelectorAll('.item').forEach(item => {
      if(item.classList.contains('hidden')) return;
      const name = item.dataset.name || item.querySelector('.name')?.textContent?.trim() || 'unknown';
      const price = parseRaw(item.dataset.price);
      const qty = parseInt(item.querySelector('.qty-input')?.value || 0) || 0;
      if(qty > 0){
        items.push({ name, price, qty, subtotal: price * qty });
      }
    });
    return items;
  }

  // helper: get qr image src (if any)
  function getQrImageSrc(){
    const qrC = document.getElementById('qrContainer');
    if(!qrC) return null;
    const img = qrC.querySelector('img');
    if(img && img.src) return img.src;
    return null;
  }

  // helper: fetch image URL -> blob
  async function fetchImageBlob(url){
    if(!url) return null;
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if(!resp.ok) throw new Error('Không tải được hình QR');
      const blob = await resp.blob();
      return blob;
    } catch(err) {
      console.warn('fetchImageBlob error', err);
      return null;
    }
  }

  // main save flow
  // main save flow (chỉnh: không lưu ảnh QR, không capture)
  async function saveInvoiceFlow() {
    try {
      const saveBtn = document.getElementById('saveInvoiceBtn');
      const oldTxt = saveBtn?.textContent;

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Đang lưu...';
      }

      // ===== COLLECT DATA =====
      const items = collectInvoiceItems();
      const shipEl = document.getElementById('ship_fee');
      const discountEl = document.getElementById('discount');

      const ship = shipEl ? parseRaw(shipEl.dataset.raw || shipEl.value) : 0;
      const discount = discountEl ? parseRaw(discountEl.dataset.raw || discountEl.value) : 0;

      const totalText = document.getElementById('modal_total')?.textContent || '0';
      const total = parseRaw(totalText);

      const note = document.getElementById('invoice_note')?.value?.trim() || '';

      const orderInput = document.getElementById('order_name');
      const now = new Date();

      const defaultName =
        now.toLocaleTimeString('en-GB', { hour12: false }) +
        ' ' +
        now.toLocaleDateString('vi-VN').replace(/\//g, '-');

      const orderName =
        orderInput && orderInput.value.trim()
          ? orderInput.value.trim()
          : defaultName;

      // ===== ENSURE AUTH =====
      if (window.FBClient?.signInAnonymouslyIfNeeded) {
        await window.FBClient.signInAnonymouslyIfNeeded();
      }

      // =====================================================
      // =============== UPDATE EXISTING INVOICE ==============
      // =====================================================
      if (currentInvoiceId) {
        const existing = await window.FBClient.getInvoice(currentInvoiceId);

        if (!existing || !existing.data) {
          alert('Hoá đơn không tồn tại hoặc đã bị xoá.');
          return;
        }

        const st = Number(existing.data.status);

        if (st === 1) {
          // 🔒 Đơn mới → BẮT BUỘC có items
          if (items.length === 0) {
            alert('Chưa có món nào để lưu.');
            return;
          }

          await window.FBClient.updateInvoice(currentInvoiceId, {
            orderName,
            items,
            ship,
            discount,
            total,
            note,
          });

        } else if (st === 2) {
          // ✅ ĐÃ THANH TOÁN → CHỈ update NOTE
          await window.FBClient.updateInvoice(currentInvoiceId, {
            note,
          });

        } else {
          alert('Hoá đơn đã huỷ, không thể sửa.');
          return;
        }

        alert('Cập nhật hoá đơn thành công.');
      } 
      // =====================================================
      // ================= CREATE NEW INVOICE =================
      // =====================================================
      else {
        const createdAt =
          now.toLocaleTimeString('en-GB', { hour12: false }) +
          ' ' +
          now.toLocaleDateString('vi-VN').replace(/\//g, '-');

        const payload = {
          orderName,
          createdAt,
          items,
          ship,
          discount,
          total,
          note,
          status: 1, // chỉ set status khi tạo mới
        };

        const saved = await window.FBClient.saveInvoice(payload);
        currentInvoiceId = saved.id;

        alert('Lưu hoá đơn thành công.');
      }

      // ===== RESET STATE =====
      currentInvoiceId = null;

      // refresh invoice list nếu đang mở
      try {
        resetInvoicePaging();
        await renderInvoiceList();
      } catch (_) {}

    } catch (err) {
      console.error('saveInvoiceFlow error', err);
      alert('Lưu hoá đơn thất bại: ' + (err.message || err));
    } finally {
      const saveBtn = document.getElementById('saveInvoiceBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Lưu hoá đơn';
      }
    }
  }

  // attach handler (call during init)
  function attachSaveHandler(){
    const btn = document.getElementById('saveInvoiceBtn');
    if(btn){
      btn.removeEventListener('click', saveInvoiceFlow); // safe remove in case
      btn.addEventListener('click', saveInvoiceFlow);
    }
  }

  function normalizeDate(createdAt) {
    if (!createdAt) return null;

    // Firestore Timestamp
    if (typeof createdAt.toDate === 'function') {
      return createdAt.toDate();
    }

    // Number (Date.now)
    if (typeof createdAt === 'number') {
      return new Date(createdAt);
    }

    // String
    if (typeof createdAt === 'string') {
      const d = new Date(createdAt);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  const INVOICE_STATUS_MAP = {
    1: { text: 'Đơn mới', class: 'st-new' },
    2: { text: 'Đã thanh toán', class: 'st-paid' },
    3: { text: 'Đã huỷ', class: 'st-cancel' },
  };

  async function loadInvoiceToItems(invoiceId) {
    if (!window.FBClient?.getInvoice) {
      alert('Không lấy được hoá đơn');
      return;
    }

    const res = await window.FBClient.getInvoice(invoiceId);
    if (!res || !res.data) {
      alert('Hoá đơn không tồn tại');
      return;
    }

    const invoice = res.data;
    currentInvoiceId = invoiceId;
    editingInvoiceData = invoice;

    // 1️⃣ reset toàn bộ items về 0
    document.querySelectorAll('.item').forEach(item => {
      const q = item.querySelector('.qty-input');
      if (q) q.value = 0;
      updateBadge(item);
    });

    // 2️⃣ map invoice items → UI items
    (invoice.items || []).forEach(invItem => {
      const itemEl = [...document.querySelectorAll('.item')]
        .find(el => el.dataset.name === invItem.name);

      if (!itemEl) return;

      const q = itemEl.querySelector('.qty-input');
      if (q) q.value = invItem.qty;

      // nếu sau này có size / variant thì map thêm ở đây
      updateBadge(itemEl);
    });

    // 3️⃣ fill meta (ship, discount, order name)
    const shipEl = document.getElementById('ship_fee');
    if (shipEl) {
      shipEl.dataset.raw = invoice.ship || 0;
      shipEl.value = formatVND(invoice.ship || 0);
    }

    const discountEl = document.getElementById('discount');
    if (discountEl) {
      discountEl.dataset.raw = invoice.discount || 0;
      discountEl.value = formatVND(invoice.discount || 0);
    }

    const orderInput = document.getElementById('order_name');
    if (orderInput) orderInput.value = invoice.orderName || '';

    const noteInput = document.getElementById('invoice_note');
    if (noteInput) {
      noteInput.value = invoice.note || '';
    }

    calculateAll();
  }

  function renderInvoiceItem(row) {
    const listRoot = document.getElementById('invoiceList');
    if (!listRoot) return;

    const id = row.id;
    const d = row.data || {};

    const name = d.orderName || '(Không tên)';
    const created = d.createdAtServer?.toDate();
    const time = created
      ? created.toLocaleString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';

    const total =
      typeof d.total !== 'undefined'
        ? formatVND(d.total) + ' ₫'
        : '-';

    const statusInfo =
      INVOICE_STATUS_MAP[d.status] || { text: 'Không rõ', class: 'st-unknown' };

    const el = document.createElement('div');
    el.className = 'item invoice-item';

    el.innerHTML = `
      <div class="invoice-header">
        <div class="name">${escapeHtml(name)}</div>
        <div class="price-badge">${total}</div>
      </div>

      <div class="invoice-footer">
        <div class="invoice-meta">
          <span class="muted">${escapeHtml(time)}</span>
          <span class="invoice-status ${statusInfo.class}">
            ${statusInfo.text}
          </span>
        </div>

        <div class="invoice-actions">
          ${
            d.status === 1
              ? `<button class="btn small-edit">Sửa</button>`
              : ''
          }

          ${
            d.status === 2
              ? `<button class="btn small-note">Ghi chú</button>`
              : ''
          }

          ${
            d.status === 1
              ? `
                <button class="btn small-pay">✓</button>
                <button class="btn small-cancel">✕</button>
              `
              : ''
          }
        </div>
      </div>

      ${d.note ? `<div class="invoice-note muted">📝 ${escapeHtml(d.note)}</div>` : ''}
    `;

    /* ===== CLICK ROW → VIEW ===== */
    el.addEventListener('click', () => {
      invoiceUIMode = 'view';
      openInvoiceDetailFallback(id, 'view');
    });

    /* ===== EDIT ===== */
    el.querySelector('.small-edit')?.addEventListener('click', async e => {
      e.stopPropagation(); // 🔥 bắt buộc

      invoiceUIMode = 'edit';
      await loadInvoiceToItems(id);
      setUIMode('items');
    });

    el.querySelector('.small-note')?.addEventListener('click', e => {
      e.stopPropagation();
      invoiceUIMode = 'edit';
      openInvoiceDetailFallback(id, 'note');
    });

    /* ===== PAY ===== */
    el.querySelector('.small-pay')?.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Xác nhận đã thanh toán?')) {
        changeInvoiceStatus(id, 2);
      }
    });

    /* ===== CANCEL ===== */
    el.querySelector('.small-cancel')?.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Xác nhận huỷ đơn?')) {
        changeInvoiceStatus(id, 3);
      }
    });

    listRoot.appendChild(el);
  }

  function applyInvoiceMode({ status }) {
    const orderInput = document.getElementById('order_name');
    const noteInput = document.getElementById('invoice_note');
    const saveBtn = document.getElementById('saveInvoiceBtn');

    // ===== VIEW =====
    if (invoiceUIMode === 'view') {
      orderInput.disabled = true;
      noteInput.disabled = true;
      saveBtn.style.display = 'none';
      return;
    }

    // ===== EDIT =====
    if (invoiceUIMode === 'edit') {
      if (status === 1) {
        // đơn mới → sửa tất
        orderInput.disabled = false;
        noteInput.disabled = false;
        saveBtn.style.display = '';
        saveBtn.textContent = 'Lưu hoá đơn';
      } 
      else if (status === 2) {
        // đã thanh toán → chỉ sửa NOTE
        orderInput.disabled = true;
        noteInput.disabled = false;
        saveBtn.style.display = '';
        saveBtn.textContent = 'Lưu ghi chú';
      } 
      else {
        // huỷ
        orderInput.disabled = true;
        noteInput.disabled = true;
        saveBtn.style.display = 'none';
      }
    }
  }

  function renderInvoiceItems(rows) {
    const listRoot = document.getElementById('invoiceList');
    const emptyEl = document.getElementById('invoiceListEmpty');

    listRoot.innerHTML = '';

    if (!rows.length) {
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    rows.forEach(row => {
      listRoot.appendChild(renderInvoiceItem(row));
    });
  }

  async function renderInvoiceList(resetPaging = false) {
    const listRoot = document.getElementById('invoiceList');
    const emptyEl = document.getElementById('invoiceListEmpty');
    if (!listRoot) return;

    if (resetPaging) {
      invoicePaging.cursorStack = [];
      invoicePaging.currentCursor = null;
    }

    listRoot.innerHTML = '<div class="muted">Đang tải...</div>';
    emptyEl.classList.add('hidden');

    try {
      const res = await FB.listInvoicesByQuery({
        status: invoiceFilters.status,
        date: invoiceFilters.date,
        limitNum: invoiceFilters.limit,
        cursor: invoicePaging.currentCursor,
      });

      listRoot.innerHTML = '';

      if (!res.rows.length) {
        emptyEl.classList.remove('hidden');
        return;
      }

      res.rows.forEach(renderInvoiceItem);
      invoicePaging.currentCursor = res.lastDoc;

      document.getElementById('prevPageBtn').disabled =
        invoicePaging.cursorStack.length === 0;

      document.getElementById('nextPageBtn').disabled =
        !res.lastDoc;

    } catch (err) {
      console.error(err);
      listRoot.innerHTML =
        '<div class="error">Không tải được hoá đơn</div>';
    }
  }

  document.getElementById('filterStatus').onchange = e => {
    invoiceFilters.status = e.target.value;
    renderInvoiceList(true);
  };

  document.getElementById('filterDate').onchange = e => {
    invoiceFilters.date = e.target.value || null;
    renderInvoiceList(true);
  };

  document.getElementById('filterLimit').onchange = e => {
    invoiceFilters.limit = Number(e.target.value) || 10;
    renderInvoiceList(true);
  };

  document.getElementById('nextPageBtn').onclick = async () => {
    invoicePaging.cursorStack.push(invoicePaging.currentCursor);
    await renderInvoiceList();
  };

  document.getElementById('prevPageBtn').onclick = async () => {
    if (!invoicePaging.cursorStack.length) return;
    invoicePaging.currentCursor = invoicePaging.cursorStack.pop();
    await renderInvoiceList();
  };

  function attachInvoiceTabHandlers(){
    const showInvoicesBtn = document.getElementById('showInvoicesBtn');
    const invoiceListPanel = document.getElementById('invoiceListPanel');
    const refreshBtn = document.getElementById('refreshInvoicesBtn');

    if (showInvoicesBtn && invoiceListPanel) {
      showInvoicesBtn.addEventListener('click', async ()=>{
        const visible = invoiceListPanel.style.display !== 'none';
        // toggle panel
        invoiceListPanel.style.display = visible ? 'none' : 'block';
        showInvoicesBtn.setAttribute('aria-pressed', String(!visible));
        if (!visible) {
          resetInvoicePaging();
          await renderInvoiceList();
        }
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async ()=> {
        resetInvoicePaging();
        await renderInvoiceList();
      });
    }
  }

  function resetInvoicePaging() {
    invoiceFilters.page = 1;
    invoicePaging.currentCursor = null;
  }

  // fallback: fetch invoice and render basic modal if showInvoiceDetail missing
  async function openInvoiceDetailFallback(id, mode){
    try {
      if (!window.FBClient || typeof window.FBClient.getInvoice !== 'function') {
        alert('Không thể lấy chi tiết hoá đơn: FBClient.getInvoice không có.');
        return;
      }
      const res = await window.FBClient.getInvoice(id);
      if (!res || !res.data) {
        alert('Không tìm thấy hoá đơn.');
        return;
      }
      const data = res.data;

      const status = Number(data.status || 1);

      currentInvoiceId = id;

      // populate compactList (modal)
      const listEl = document.getElementById('compactList');
      listEl.innerHTML = '';
      const items = data.items || [];
      items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'line';
        row.innerHTML = `<div style="flex:1">${idx+1}. ${escapeHtml(it.name)} x${it.qty}</div><div style="min-width:90px; text-align:right">${formatVND(it.subtotal)} ₫</div>`;
        listEl.appendChild(row);
      });

      // meta
      document.getElementById('modal_ship').textContent = formatVND(data.ship||0) + 'đ';
      document.getElementById('modal_discount').textContent = formatVND(data.discount||0) + 'đ';
      const grand = data.total || (items.reduce((s,i)=>s+(i.subtotal||0),0) + (data.ship||0) - (data.discount||0));
      document.getElementById('modal_total').textContent = formatVND(Math.max(0, grand)) + 'đ';

      const orderInput = document.getElementById('order_name');
      if (orderInput) { orderInput.value = data.orderName || ''; }

      const noteInput = document.getElementById('invoice_note');
      if (noteInput) {
        noteInput.value = data.note || '';
      }

      // NOTE: chỉ khoá khi HUỶ
      if (noteInput) {
        noteInput.disabled = (status === 3);
      }

      // disable editing if status != 1
      const saveBtn = document.getElementById('saveInvoiceBtn');

      const editable = mode === 'edit' && status === 1;
      const editableNote = mode === 'edit' || mode === 'note';

      if (orderInput) {
        orderInput.disabled = !editable;
      }

      if (noteInput) noteInput.disabled = !editableNote;

      if (saveBtn) {
        if (mode === 'edit') {
          // Đơn mới → sửa toàn bộ
          saveBtn.style.display = '';
          saveBtn.disabled = false;
          saveBtn.textContent = 'Lưu hoá đơn';

        } else if (mode === 'note') {
          // Đã thanh toán → chỉ sửa note
          saveBtn.style.display = '';
          saveBtn.disabled = false;
          saveBtn.textContent = 'Lưu ghi chú';

        } else {
          // View thuần
          saveBtn.style.display = 'none';
        }
      }

      // render fresh QR by calling existing function
      if (grand > 0) {
        try { await showQRCodeForAmount(grand); } catch(e){ console.warn(e); }
      } else {
        clearQrContainer();
      }

      // show modal
      document.getElementById('modalBackdrop').style.display = 'flex';
      document.getElementById('closeModal').focus();
    } catch (err) {
      console.error('openInvoiceDetailFallback', err);
      alert('Lỗi khi tải chi tiết: ' + (err.message || err));
    }

    if (mode !== 'note') {
      currentInvoiceId = null;
    }

    const status = Number(data.status);
    applyInvoiceMode({ status });
  }

  async function changeInvoiceStatus(id, newStatus) {
    try {
      if (!window.FBClient || typeof window.FBClient.updateInvoiceStatus !== 'function') {
        alert('FBClient.updateInvoiceStatus không khả dụng.');
        return;
      }
      await window.FBClient.signInAnonymouslyIfNeeded?.();
      await window.FBClient.updateInvoiceStatus(id, newStatus);
      alert('Cập nhật trạng thái thành công.');
      // refresh UI
      await renderInvoiceList().catch(()=>{});
      // nếu modal đang mở và đó là same invoice, reload detail
      if (currentInvoiceId === id) {
        await openInvoiceDetailFallback(id);
      }
    } catch (err) {
      console.error('changeInvoiceStatus', err);
      alert('Cập nhật trạng thái thất bại: ' + (err.message || err));
    }
  }

  attachInvoiceTabHandlers();

  function getTodayYYYYMMDD() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function attachInvoiceFilterHandlers() {
    const dateEl = document.getElementById('filterDate');
    const statusEl = document.getElementById('filterStatus');
    const limitEl = document.getElementById('filterLimit');

    invoiceFilters.date = getTodayYYYYMMDD();
    invoiceFilters.status = 1;
    invoiceFilters.limit = Number(limitEl?.value || 10);
    invoiceFilters.page = 1;

    if (dateEl) {
      dateEl.value = invoiceFilters.date || '';
      dateEl.addEventListener('change', async () => {
        invoiceFilters.date = dateEl.value || null;
        resetInvoicePaging();
        await renderInvoiceList();
      });
    }

    if (statusEl) {
      statusEl.value = invoiceFilters.status;
      statusEl.addEventListener('change', async () => {
        invoiceFilters.status = statusEl.value;
        invoiceFilters.page = 1;
        await renderInvoiceList();
      });
    }

    if (limitEl) {
      limitEl.value = invoiceFilters.limit;
      limitEl.addEventListener('change', async () => {
        invoiceFilters.limit = Number(limitEl.value) || 10;
        invoiceFilters.page = 1;
        await renderInvoiceList();
      });
    }

    // pagination
    document.getElementById('prevPageBtn')?.addEventListener('click', async () => {
      if (invoiceFilters.page > 1) {
        invoiceFilters.page--;
        await renderInvoiceList();
      }
    });

    document.getElementById('nextPageBtn')?.addEventListener('click', async () => {
      invoiceFilters.page++;
      await renderInvoiceList();
    });
  }


  attachInvoiceFilterHandlers();

  // ----- Kick off -----
  init();
});

