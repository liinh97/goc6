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

document.addEventListener('DOMContentLoaded', function () {
  // ----- Data + init -----
  const RAW = [
    ["Nem TCC",3800],
    ["Nem TCC xù", {Chín:6500, Sống:4000}],
    ["Nem TCC vỏ giòn", {Chín:7000, Sống:5000}],
    ["Nem TCC phomai", {Chín:13000, Sống:11000}],
    ["Bánh rán mặn",8000],
    ["Bánh rán phomai",8000],
    ["Nem chua thường",7000],
    ["Nem chua phomai",9000],
    ["Nem chua vỏ giòn",5000],
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

  const FAV_INIT = ["Bánh rán mặn", "Bánh rán phomai", "Nem TCC xù", "Nem TCC vỏ giòn", "Nem TCC phomai", "Chân gà rút xương"];
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
    item.className = 'item';
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
    const price = parseRaw(item.dataset.price);
    const qty = parseInt(item.querySelector('.qty-input').value)||0;
    const badge = item.querySelector('.price-badge');
    if(!badge) return;
    if(qty > 0){
      badge.textContent = formatVND(price * qty) + ' ₫';
    } else {
      badge.textContent = '0 ₫';
    }
  }

  // ----- Init and handlers -----
  function init(){
    renderList();

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
      showFavsBtn.classList.toggle('active', filterFavsOnly);
      showFavsBtn.setAttribute('aria-pressed', String(filterFavsOnly));
      applyFilter();
      showFavsBtn.addEventListener('click', ()=>{
        filterFavsOnly = !filterFavsOnly;
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
    document.querySelectorAll('.item').forEach(item=>{
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
    document.querySelectorAll('.item').forEach(item=>{
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
    document.querySelectorAll('.item').forEach(item=>{
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
      const items = collectInvoiceItems();
      const shipEl = document.getElementById('ship_fee');
      const discountEl = document.getElementById('discount');
      const ship = shipEl ? parseRaw(shipEl.dataset.raw || shipEl.value) : 0;
      const discount = discountEl ? parseRaw(discountEl.dataset.raw || discountEl.value) : 0;
      const totalText = document.getElementById('modal_total')?.textContent || '0';
      const total = parseRaw(totalText);

      const orderInput = document.getElementById('order_name');
      const now = new Date();
      const defaultName = now.toLocaleTimeString('en-GB', {hour12:false}) + ' ' + now.toLocaleDateString('vi-VN').replace(/\//g, '-');
      const orderName = (orderInput && orderInput.value.trim()) ? orderInput.value.trim() : defaultName;
      const createdAt = now.toISOString();
      const displayTime = now.toLocaleTimeString('en-GB', {hour12:false}) + ' ' + now.toLocaleDateString('vi-VN').replace(/\//g, '-');

      if (items.length === 0) { alert('Chưa có món nào để lưu.'); return; }

      const metadata = { orderName, createdAt, createdAtDisplay: displayTime, items, ship, discount, total };

      const saveBtn = document.getElementById('saveInvoiceBtn');
      const oldTxt = saveBtn ? saveBtn.textContent : null;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }

      // ensure auth then save to Firestore
      if (window.FBClient && typeof window.FBClient.signInAnonymouslyIfNeeded === 'function') {
        await window.FBClient.signInAnonymouslyIfNeeded();
      }

      const saved = await window.FBClient.saveInvoice(metadata);
      alert('Lưu hoá đơn thành công. ID: ' + saved.id);

      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = oldTxt || 'Lưu hoá đơn'; }
    } catch (err) {
      console.error('saveInvoiceFlow error', err);
      alert('Lưu hoá đơn thất bại: ' + (err.message || err));
      const saveBtn = document.getElementById('saveInvoiceBtn');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Lưu hoá đơn'; }
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

  // ----- Kick off -----
  init();
});
