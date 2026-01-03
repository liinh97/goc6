// assets/js/modules/stats.js
import { formatVND, parseRaw } from '../core/utils.js';
import { state } from '../core/state.js';

let _client = null;
let _products = null;

// ====== CONFIG DEFAULTS (bạn đổi được trong UI) ======
const DEFAULT_COST_RATIO = 0.5; // thiếu cost -> ước lượng = giá bán * 50% (tạm)
const DEFAULT_EXTRA_EVERY_N = 7;
const DEFAULT_EXTRA_AVG_COST = 500;
const DEFAULT_BASE_COST = 2000;

// ====== COST OVERRIDES (bạn điền dần) ======
const ITEM_COST_OVERRIDES = {
  // Ví dụ theo bạn:
  // "Nem TCC xù": 3000,
  // "Nem TCC": 3000,
};

export function initStats({ client, products }) {
  _client = client;
  _products = products;

  const btn = document.getElementById('showStatisticalBtn');
  const backdrop = document.getElementById('statsBackdrop');
  const closeBtn = document.getElementById('closeStatsBtn');
  const runBtn = document.getElementById('runStatsBtn');

  if (!btn || !backdrop || !runBtn) return;

  // init inputs defaults
  setFormattedMoneyInput('statsBaseCost', DEFAULT_BASE_COST);
  setFormattedMoneyInput('statsExtraAvgCost', DEFAULT_EXTRA_AVG_COST);

  const extraEveryNEl = document.getElementById('statsExtraEveryN');
  if (extraEveryNEl) extraEveryNEl.value = String(DEFAULT_EXTRA_EVERY_N);

  btn.addEventListener('click', () => {
    backdrop.classList.remove('hidden');
  });

  closeBtn?.addEventListener('click', () => {
    backdrop.classList.add('hidden');
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.add('hidden');
  });

  runBtn.addEventListener('click', async () => {
    await runStats();
  });
}

async function runStats() {
  const summaryEl = document.getElementById('statsSummary');
  const warnEl = document.getElementById('statsWarnings');
  const tbody = document.getElementById('statsTableBody');

  if (!summaryEl || !tbody) return;

  warnEl?.classList.add('hidden');
  warnEl && (warnEl.textContent = '');
  summaryEl.textContent = 'Đang tải hoá đơn đã thanh toán...';
  tbody.innerHTML = `<tr><td colspan="7" class="muted" style="padding:10px;">Đang tải...</td></tr>`;

  if (!_client?.listInvoicesByQuery) {
    summaryEl.textContent = 'Thiếu client.listInvoicesByQuery';
    return;
  }

  // filters
  const fromDate = document.getElementById('statsFromDate')?.value || null; // yyyy-mm-dd
  const toDate = document.getElementById('statsToDate')?.value || null;

  const baseCost = parseRaw(document.getElementById('statsBaseCost')?.dataset?.raw || '0');
  const extraEveryN = Number(document.getElementById('statsExtraEveryN')?.value || DEFAULT_EXTRA_EVERY_N) || DEFAULT_EXTRA_EVERY_N;
  const extraAvgCost = parseRaw(document.getElementById('statsExtraAvgCost')?.dataset?.raw || String(DEFAULT_EXTRA_AVG_COST));

  // build cost map from products list + overrides
  const { costMap, estimatedItems } = buildCostMapFromProducts();

  // load all paid invoices (status=2)
  const invoices = await loadAllPaidInvoices({ fromDate, toDate });

  const result = computeStats({
    invoices,
    costMap,
    estimatedItems,
    baseCostPerInvoice: baseCost,
    extraEveryN,
    extraAvgCost,
  });

  renderStats(result);
}

function buildCostMapFromProducts() {
  const costMap = new Map();
  const estimatedItems = new Set();

  // lấy từ PRODUCTS/state (tuỳ bạn đang giữ đâu)
  // ưu tiên overrides, thiếu thì estimate theo giá bán * DEFAULT_COST_RATIO
  const productsList = state?.PRODUCTS || _products?.state?.PRODUCTS || [];

  for (const p of productsList) {
    const name = p?.name;
    if (!name) continue;

    const override = ITEM_COST_OVERRIDES[name];
    if (isFinite(Number(override))) {
      costMap.set(name, Number(override));
      continue;
    }

    // estimate theo variant đầu (giá bán mặc định)
    const price = Number(p?.variants?.[0]?.price || 0);
    const est = Math.round(price * DEFAULT_COST_RATIO);
    costMap.set(name, est);
    estimatedItems.add(name);
  }

  // override cuối cùng để chắc
  for (const [k, v] of Object.entries(ITEM_COST_OVERRIDES)) {
    if (isFinite(Number(v))) {
      costMap.set(k, Number(v));
      estimatedItems.delete(k);
    }
  }

  return { costMap, estimatedItems };
}

async function loadAllPaidInvoices({ fromDate, toDate }) {
  const rows = [];
  let cursor = null;
  const limitNum = 50; // tránh nặng, tự paging

  // Mẹo: nếu client của bạn hỗ trợ query theo date exact thì range sẽ khó.
  // Ta load status=2 theo paging, rồi lọc client-side theo createdAtServer.
  for (let guard = 0; guard < 200; guard++) {
    const res = await _client.listInvoicesByQuery({
      status: 2,
      date: null,
      limitNum,
      cursor,
    });

    const batch = res?.rows || [];
    for (const r of batch) rows.push(r);

    cursor = res?.lastDoc || null;
    if (!cursor || batch.length === 0) break;
  }

  // lọc theo ngày nếu có
  const filtered = rows.filter(r => {
    const d = r?.data || {};
    const dt = d.createdAtServer?.toDate ? d.createdAtServer.toDate() : null;
    if (!dt) return true;

    if (fromDate) {
      const [y,m,dd] = fromDate.split('-').map(Number);
      const from = new Date(y, m-1, dd, 0,0,0,0);
      if (dt < from) return false;
    }
    if (toDate) {
      const [y,m,dd] = toDate.split('-').map(Number);
      const to = new Date(y, m-1, dd, 23,59,59,999);
      if (dt > to) return false;
    }
    return true;
  });

  // return invoice data objects (giống bạn dùng ở invoice UI)
  return filtered.map(r => r.data).filter(Boolean);
}

function computeStats({ invoices, costMap, estimatedItems, baseCostPerInvoice, extraEveryN, extraAvgCost }) {
  let totalRevenue = 0;
  let totalItemsCost = 0;
  let totalBaseCost = 0;
  let invoiceCount = 0;

  const expectedExtraPerInvoice = extraEveryN > 0 ? (extraAvgCost / extraEveryN) : 0;
  const perItem = new Map();

  for (const inv of invoices) {
    const status = Number(inv.status);
    if (status !== 2) continue;

    invoiceCount++;

    const revenue = Math.max(0, Number(inv.total) || 0);
    totalRevenue += revenue;

    const items = Array.isArray(inv.items) ? inv.items : [];
    const itemsRevenue = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);

    const orderCost = (Number(baseCostPerInvoice) || 0) + expectedExtraPerInvoice;
    totalBaseCost += orderCost;

    for (const it of items) {
      const name = it?.name || '(Không tên)';
      const qty = Number(it.qty) || 0;
      const sub = Number(it.subtotal) || 0;

      const unitCost = Number(costMap.get(name) ?? 0);
      const cost = unitCost * qty;
      totalItemsCost += cost;

      const overheadShare = itemsRevenue > 0 ? orderCost * (sub / itemsRevenue) : 0;
      const profit = sub - cost - overheadShare;

      const row = perItem.get(name) || { name, qty: 0, revenue: 0, cost: 0, overhead: 0, profit: 0, estimated: false };
      row.qty += qty;
      row.revenue += sub;
      row.cost += cost;
      row.overhead += overheadShare;
      row.profit += profit;
      row.estimated = row.estimated || estimatedItems.has(name);
      perItem.set(name, row);
    }
  }

  const totalProfit = totalRevenue - totalItemsCost - totalBaseCost;
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) : 0;

  const items = [...perItem.values()].sort((a,b) => b.profit - a.profit);

  return {
    invoiceCount,
    totalRevenue,
    totalItemsCost,
    totalBaseCost,
    totalProfit,
    margin,
    expectedExtraPerInvoice,
    items,
  };
}

function renderStats(res) {
  const summaryEl = document.getElementById('statsSummary');
  const warnEl = document.getElementById('statsWarnings');
  const tbody = document.getElementById('statsTableBody');
  if (!summaryEl || !tbody) return;

  summaryEl.innerHTML = `
    <div>Hoá đơn đã thanh toán: <strong>${res.invoiceCount}</strong></div>
    <div>Tổng doanh thu: <strong>${formatVND(res.totalRevenue)} ₫</strong></div>
    <div>Tổng cost món: <strong>${formatVND(res.totalItemsCost)} ₫</strong></div>
    <div>Overhead (base + phát sinh kỳ vọng): <strong>${formatVND(res.totalBaseCost)} ₫</strong>
      <span class="muted"> (phát sinh kỳ vọng/đơn: ~${formatVND(Math.round(res.expectedExtraPerInvoice))} ₫)</span>
    </div>
    <div>Tổng lãi (ước lượng): <strong>${formatVND(Math.round(res.totalProfit))} ₫</strong>
      <span class="muted"> (biên lãi ~${(res.margin*100).toFixed(1)}%)</span>
    </div>
  `;

  // warnings: món đang estimate cost
  const estimated = res.items.filter(x => x.estimated).map(x => x.name);
  if (estimated.length && warnEl) {
    warnEl.classList.remove('hidden');
    warnEl.textContent = `Cảnh báo: Có ${estimated.length} món đang dùng cost ước lượng (tạm = giá bán * 50%). Bạn nên điền cost thật để lãi không bị sai.`;
  }

  if (!res.items.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="padding:10px;">Không có dữ liệu.</td></tr>`;
    return;
  }

  tbody.innerHTML = res.items.map(r => {
    const m = r.revenue > 0 ? (r.profit / r.revenue) : 0;
    return `
      <tr>
        <td style="padding:10px; border-bottom:1px solid #eef1f6;">
          ${escapeCell(r.name)} ${r.estimated ? `<span class="muted">(ước lượng cost)</span>` : ``}
        </td>
        <td style="padding:10px; text-align:right; border-bottom:1px solid #eef1f6;">${r.qty}</td>
        <td style="padding:10px; text-align:right; border-bottom:1px solid #eef1f6;">${formatVND(r.revenue)} ₫</td>
        <td style="padding:10px; text-align:right; border-bottom:1px solid #eef1f6;">${formatVND(r.cost)} ₫</td>
        <td style="padding:10px; text-align:right; border-bottom:1px solid #eef1f6;">${formatVND(Math.round(r.overhead))} ₫</td>
        <td style="padding:10px; text-align:right; border-bottom:1px solid #eef1f6;"><strong>${formatVND(Math.round(r.profit))} ₫</strong></td>
        <td style="padding:10px; text-align:right; border-bottom:1px solid #eef1f6;">${(m*100).toFixed(1)}%</td>
      </tr>
    `;
  }).join('');
}

function escapeCell(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setFormattedMoneyInput(id, initial) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.raw = String(initial || 0);
  el.value = formatVND(initial || 0);

  el.addEventListener('input', e => {
    const digits = (e.target.value || '').replace(/[^0-9]/g, '');
    const v = parseInt(digits) || 0;
    e.target.dataset.raw = String(v);
    e.target.value = formatVND(v);
  });

  el.addEventListener('focus', e => {
    e.target.value = String(e.target.dataset.raw || '0');
    setTimeout(() => { try { e.target.setSelectionRange(e.target.value.length, e.target.value.length); } catch {} }, 0);
  });

  el.addEventListener('blur', e => {
    const v = parseRaw(e.target.value) || parseRaw(e.target.dataset.raw);
    e.target.dataset.raw = String(v);
    e.target.value = formatVND(v);
  });
}
