import { state } from '../core/state.js';
import { formatVND, parseRaw, escapeHtml, getTodayYYYYMMDD } from '../core/utils.js';
import { openInvoiceModalFromInvoiceData } from './invoice-ui.js';

const INVOICE_STATUS_MAP = {
  1: { text: 'Đơn mới', class: 'st-new' },
  2: { text: 'Đã thanh toán', class: 'st-paid' },
  3: { text: 'Đã huỷ', class: 'st-cancel' },
};

export function initInvoices({ client, products, setUIMode }) {
  if (!client?.listInvoicesByQuery) {
    console.warn('initInvoices: client.listInvoicesByQuery missing');
  }

  attachInvoiceFilterInit();
  attachInvoiceFilterHandlers({ client, products });
  attachInvoicePagingHandlers({ client, products });
  attachInvoiceTabHandlers({ client, products });
  attachSaveHandler({ client, products });

  // row click handlers are attached during render
}

export async function renderInvoiceList({ client, products, resetPaging = false } = {}) {
  if (!products) throw new Error('Thiếu products khi renderInvoiceList');
  const listRoot = document.getElementById('invoiceList');
  const emptyEl = document.getElementById('invoiceListEmpty');
  if (!listRoot) return;

  if (resetPaging) {
    state.invoicePaging.cursorStack = [];
    state.invoicePaging.currentCursor = null;
    state.invoiceFilters.page = 1;
  }

  listRoot.innerHTML = '<div class="muted">Đang tải...</div>';
  emptyEl?.classList.add('hidden');

  try {
    if (typeof client.listInvoicesByQuery !== 'function') {
      throw new Error('Thiếu listInvoicesByQuery');
    }

    const res = await client.listInvoicesByQuery({
      status: state.invoiceFilters.status,
      date: state.invoiceFilters.date,
      limitNum: state.invoiceFilters.limit,
      cursor: state.invoicePaging.currentCursor,
    });

    listRoot.innerHTML = '';

    const rows = res?.rows || [];
    if (!rows.length) {
      emptyEl?.classList.remove('hidden');
      document.getElementById('nextPageBtn') && (document.getElementById('nextPageBtn').disabled = true);
      document.getElementById('prevPageBtn') && (document.getElementById('prevPageBtn').disabled = state.invoicePaging.cursorStack.length === 0);
      return;
    }

    rows.forEach(row => listRoot.appendChild(renderInvoiceRow({ row, client, products })));

    state.invoicePaging.currentCursor = res.lastDoc || null;
    document.getElementById('prevPageBtn') && (document.getElementById('prevPageBtn').disabled = state.invoicePaging.cursorStack.length === 0);
    document.getElementById('nextPageBtn') && (document.getElementById('nextPageBtn').disabled = !res.lastDoc);

  } catch (err) {
    console.error(err);
    listRoot.innerHTML = '<div class="error">Không tải được hoá đơn</div>';
  }
}

function renderInvoiceRow({ row, client, products }) {
  const id = row.id;
  const d = row.data || {};

  const name = d.orderName || '(Không tên)';
  const created = d.createdAtServer?.toDate ? d.createdAtServer.toDate() : null;
  const time = created
    ? created.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  const total = (typeof d.total !== 'undefined') ? (formatVND(d.total) + ' ₫') : '-';
  const statusInfo = INVOICE_STATUS_MAP[d.status] || { text: 'Không rõ', class: 'st-unknown' };

  const el = document.createElement('div');
  el.className = 'item invoice-item';

  el.innerHTML = `
    <div class="invoice-header">
      <div class="name">${escapeHtml(name)}</div>
      <div class="price-badge">${escapeHtml(total)}</div>
    </div>

    <div class="invoice-footer">
      <div class="invoice-meta">
        <span class="muted">${escapeHtml(time)}</span>
        <span class="invoice-status ${statusInfo.class}">${statusInfo.text}</span>
      </div>

      <div class="invoice-actions">
        ${d.status === 1 ? `<button class="btn small-edit">Sửa</button>` : ''}
        ${d.status === 2 ? `<button class="btn small-note">Ghi chú</button>` : ''}
        ${d.status === 1 ? `<button class="btn small-pay">✓</button><button class="btn small-cancel">✕</button>` : ''}
      </div>
    </div>

    ${d.note ? `<div class="invoice-note muted">📝 ${escapeHtml(d.note)}</div>` : ''}
  `;

  // VIEW
  el.addEventListener('click', async () => {
    state.invoiceUIMode = 'view';
    await openInvoiceDetail({ client, id, mode: 'view' });
  });

  // EDIT (status=1)
  el.querySelector('.small-edit')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    state.invoiceUIMode = 'edit';
    await loadInvoiceToItems({ client, products, invoiceId: id });
  });

  // NOTE (status=2)
  el.querySelector('.small-note')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    state.invoiceUIMode = 'edit';
    await openInvoiceDetail({ client, id, mode: 'note' });
  });

  // PAY
  el.querySelector('.small-pay')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('Xác nhận đã thanh toán?')) {
      await changeInvoiceStatus({ client, id, newStatus: 2 });
    }
  });

  // CANCEL
  el.querySelector('.small-cancel')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('Xác nhận huỷ đơn?')) {
      await changeInvoiceStatus({ client, id, newStatus: 3 });
    }
  });

  return el;
}

async function loadInvoiceToItems({ client, products, invoiceId }) {
  if (typeof client.getInvoice !== 'function') return alert('Không lấy được hoá đơn');

  const res = await client.getInvoice(invoiceId);
  if (!res || !res.data) return alert('Hoá đơn không tồn tại');

  const invoice = res.data;
  state.currentInvoiceId = invoiceId;
  state.editingInvoiceData = invoice;

  // reset qty
  products.resetQuantities();

  // map items
  (invoice.items || []).forEach(invItem => {
    const itemEl = [...document.querySelectorAll('.product-item')]
      .find(el => el.dataset.name === invItem.name);
    if (!itemEl) return;

    const q = itemEl.querySelector('.qty-input');
    if (q) q.value = invItem.qty;
  });

  // fill ship/discount
  const shipEl = document.getElementById('ship_fee');
  if (shipEl) { shipEl.dataset.raw = invoice.ship || 0; shipEl.value = formatVND(invoice.ship || 0); }

  const discountEl = document.getElementById('discount');
  if (discountEl) { discountEl.dataset.raw = invoice.discount || 0; discountEl.value = formatVND(invoice.discount || 0); }

  // order name + note
  document.getElementById('order_name') && (document.getElementById('order_name').value = invoice.orderName || '');
  document.getElementById('invoice_note') && (document.getElementById('invoice_note').value = invoice.note || '');

  products.calculateAll();

  // về items mode
  if (typeof window.setUIMode === 'function') window.setUIMode('items');
  else document.body.classList.remove('mode-invoices'), document.body.classList.add('mode-items');
}

async function openInvoiceDetail({ client, id, mode }) {
  if (typeof client.getInvoice !== 'function') return alert('Không thể lấy chi tiết hoá đơn');

  const res = await client.getInvoice(id);
  if (!res || !res.data) return alert('Không tìm thấy hoá đơn.');

  const data = res.data;
  const status = Number(data.status || 1);

  state.currentInvoiceId = id;

  // fill inputs
  document.getElementById('order_name') && (document.getElementById('order_name').value = data.orderName || '');
  document.getElementById('invoice_note') && (document.getElementById('invoice_note').value = data.note || '');

  openInvoiceModalFromInvoiceData(data);
  applyInvoiceMode({ status, mode });

  // NOTE mode: giữ currentInvoiceId để save note
  // VIEW mode: không cần reset ở đây (để user bấm note/save vẫn đúng)
}

function applyInvoiceMode({ status, mode }) {
  const orderInput = document.getElementById('order_name');
  const noteInput = document.getElementById('invoice_note');
  const saveBtn = document.getElementById('saveInvoiceBtn');

  if (!orderInput || !noteInput || !saveBtn) return;

  if (mode === 'view') {
    orderInput.disabled = true;
    noteInput.disabled = true;
    saveBtn.style.display = 'none';
    return;
  }

  // mode edit/note
  if (status === 1) {
    orderInput.disabled = false;
    noteInput.disabled = false;
    saveBtn.style.display = '';
    saveBtn.textContent = 'Lưu hoá đơn';
  } else if (status === 2) {
    orderInput.disabled = true;
    noteInput.disabled = false;
    saveBtn.style.display = '';
    saveBtn.textContent = 'Lưu ghi chú';
  } else {
    orderInput.disabled = true;
    noteInput.disabled = true;
    saveBtn.style.display = 'none';
  }
}

async function changeInvoiceStatus({ client, id, newStatus }) {
  try {
    if (typeof client.updateInvoiceStatus !== 'function') throw new Error('Thiếu updateInvoiceStatus');

    await client.signInAnonymouslyIfNeeded?.();
    await client.updateInvoiceStatus(id, newStatus);

    alert('Cập nhật trạng thái thành công.');
    await renderInvoiceList({ client }).catch(() => {});
  } catch (err) {
    console.error(err);
    alert('Cập nhật trạng thái thất bại: ' + (err.message || err));
  }
}

function attachSaveHandler({ client, products }) {
  const btn = document.getElementById('saveInvoiceBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    await saveInvoiceFlow({ client, products });
  });
}

async function saveInvoiceFlow({ client, products }) {
  try {
    const saveBtn = document.getElementById('saveInvoiceBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }

    const items = products.collectInvoiceItems();
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
      now.toLocaleTimeString('en-GB', { hour12: false }) + ' ' +
      now.toLocaleDateString('vi-VN').replace(/\//g, '-');

    const orderName = orderInput && orderInput.value.trim() ? orderInput.value.trim() : defaultName;

    await client.signInAnonymouslyIfNeeded?.();

    // UPDATE
    if (state.currentInvoiceId) {
      const existing = await client.getInvoice(state.currentInvoiceId);
      if (!existing || !existing.data) {
        alert('Hoá đơn không tồn tại hoặc đã bị xoá.');
        return;
      }

      const st = Number(existing.data.status);

      if (st === 1) {
        if (items.length === 0) { alert('Chưa có món nào để lưu.'); return; }

        await client.updateInvoice(state.currentInvoiceId, {
          orderName,
          items,
          ship,
          discount,
          total,
          note,
        });

      } else if (st === 2) {
        await client.updateInvoice(state.currentInvoiceId, { note });
      } else {
        alert('Hoá đơn đã huỷ, không thể sửa.');
        return;
      }

      alert('Cập nhật hoá đơn thành công.');
    }
    // CREATE
    else {
      const createdAt =
        now.toLocaleTimeString('en-GB', { hour12: false }) + ' ' +
        now.toLocaleDateString('vi-VN').replace(/\//g, '-');

      const payload = {
        orderName,
        createdAt,
        items,
        ship,
        discount,
        total,
        note,
        status: 1,
      };

      const saved = await client.saveInvoice(payload);
      state.currentInvoiceId = saved?.id || null;

      alert('Lưu hoá đơn thành công.');
    }

    // reset state + refresh list
    state.currentInvoiceId = null;
    await renderInvoiceList({ client, resetPaging: true }).catch(() => {});

  } catch (err) {
    console.error('saveInvoiceFlow error', err);
    alert('Lưu hoá đơn thất bại: ' + (err.message || err));
  } finally {
    const saveBtn = document.getElementById('saveInvoiceBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Lưu hoá đơn'; }
  }
}

function attachInvoiceTabHandlers({ client, products }) {
  const showInvoicesBtn = document.getElementById('showInvoicesBtn');
  const invoiceListPanel = document.getElementById('invoiceListPanel');
  const refreshBtn = document.getElementById('refreshInvoicesBtn');

  showInvoicesBtn?.addEventListener('click', async () => {
    if (!invoiceListPanel) return;
    const visible = invoiceListPanel.style.display !== 'none';
    invoiceListPanel.style.display = visible ? 'none' : 'block';
    showInvoicesBtn.setAttribute('aria-pressed', String(!visible));
    if (!visible) {
      resetInvoicePaging();
      await renderInvoiceList({ client, products });
    }
  });

  refreshBtn?.addEventListener('click', async () => {
    resetInvoicePaging();
    await renderInvoiceList({ client, products });
  });
}

function resetInvoicePaging() {
  state.invoiceFilters.page = 1;
  state.invoicePaging.currentCursor = null;
  state.invoicePaging.cursorStack = [];
}

function attachInvoiceFilterInit() {
  state.invoiceFilters.date = getTodayYYYYMMDD();
  state.invoiceFilters.status = 1; // default: đơn mới
  state.invoiceFilters.limit = Number(document.getElementById('filterLimit')?.value || 10);
  state.invoiceFilters.page = 1;

  const dateEl = document.getElementById('filterDate');
  if (dateEl) dateEl.value = state.invoiceFilters.date || '';

  const statusEl = document.getElementById('filterStatus');
  if (statusEl) statusEl.value = state.invoiceFilters.status;

  const limitEl = document.getElementById('filterLimit');
  if (limitEl) limitEl.value = state.invoiceFilters.limit;
}

function attachInvoiceFilterHandlers({ client, products }) {
  document.getElementById('filterStatus')?.addEventListener('change', async (e) => {
    state.invoiceFilters.status = e.target.value;
    resetInvoicePaging();
    await renderInvoiceList({ client, products });
  });

  document.getElementById('filterDate')?.addEventListener('change', async (e) => {
    state.invoiceFilters.date = e.target.value || null;
    resetInvoicePaging();
    await renderInvoiceList({ client, products });
  });

  document.getElementById('filterLimit')?.addEventListener('change', async (e) => {
    state.invoiceFilters.limit = Number(e.target.value) || 10;
    resetInvoicePaging();
    await renderInvoiceList({ client, products });
  });
}

function attachInvoicePagingHandlers({ client, products }) {
  document.getElementById('nextPageBtn')?.addEventListener('click', async () => {
    state.invoicePaging.cursorStack.push(state.invoicePaging.currentCursor);
    await renderInvoiceList({ client, products });
  });

  document.getElementById('prevPageBtn')?.addEventListener('click', async () => {
    if (!state.invoicePaging.cursorStack.length) return;
    state.invoicePaging.currentCursor = state.invoicePaging.cursorStack.pop();
    await renderInvoiceList({ client, products });
  });
}

