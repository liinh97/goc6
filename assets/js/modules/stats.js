import { formatVND, escapeHtml, normalizeDate } from '../core/utils.js';

const COST_MAP = {
  // "Nem TCC": 2700,
};

function hasCost() {
  return Object.keys(COST_MAP).length > 0;
}

function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = String(v); }
function setHidden(id, hidden) { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !!hidden); }

function parseDateInput(val) {
  if (!val) return null;
  const d = new Date(val + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function inRange(d, from, to) {
  if (!d) return false;
  const t = d.getTime();
  if (from) {
    const f = new Date(from); f.setHours(0,0,0,0);
    if (t < f.getTime()) return false;
  }
  if (to) {
    const tt = new Date(to); tt.setHours(23,59,59,999);
    if (t > tt.getTime()) return false;
  }
  return true;
}

function openStatModal() {
  const back = document.getElementById('statBackdrop');
  if (!back) return;
  back.classList.remove('hidden');
  back.setAttribute('aria-hidden', 'false');
}

function closeStatModal() {
  const back = document.getElementById('statBackdrop');
  if (!back) return;
  back.classList.add('hidden');
  back.setAttribute('aria-hidden', 'true');
}

async function fetchAllPaidInvoices(client) {
  if (typeof client.listInvoicesByQuery !== 'function') throw new Error('Thiếu listInvoicesByQuery');
  const all = [];
  let cursor = null;
  const LIMIT = 30;

  while (true) {
    const res = await client.listInvoicesByQuery({
      status: 2,
      date: null,
      limitNum: LIMIT,
      cursor,
    });

    const rows = res?.rows || [];
    all.push(...rows);

    if (!res?.lastDoc) break;
    cursor = res.lastDoc;
    if (!rows.length) break;
  }

  return all;
}

function calcStats(rows, fromDate, toDate) {
  const agg = new Map();
  let invoiceCount = 0;
  let revenueTotal = 0;
  let qtyTotal = 0;

  const useCost = hasCost();

  for (const row of rows) {
    const d = row?.data || {};
    if (Number(d.status) !== 2) continue;

    const created = d.createdAtServer?.toDate ? d.createdAtServer.toDate() : normalizeDate(d.createdAtServer || d.createdAt);
    if (!inRange(created, fromDate, toDate)) continue;

    invoiceCount++;
    revenueTotal += Number(d.total || 0) || 0;

    const items = Array.isArray(d.items) ? d.items : [];
    for (const it of items) {
      const name = String(it?.name || '').trim();
      if (!name) continue;

      const qty = Number(it?.qty || 0) || 0;
      const subtotal = Number(it?.subtotal || 0) || 0;

      qtyTotal += qty;

      if (!agg.has(name)) agg.set(name, { name, qty: 0, revenue: 0, cost: 0, profit: 0 });
      const rec = agg.get(name);

      rec.qty += qty;
      rec.revenue += subtotal;

      if (useCost) {
        const unitCost = Number(COST_MAP[name] || 0) || 0;
        rec.cost += unitCost * qty;
      }
    }
  }

  const itemsArr = Array.from(agg.values()).map(x => {
    if (useCost) x.profit = x.revenue - x.cost;
    return x;
  }).sort((a,b) => b.revenue - a.revenue);

  const costTotal = useCost ? itemsArr.reduce((s, x) => s + (x.cost || 0), 0) : 0;
  const profitTotal = useCost ? (revenueTotal - costTotal) : 0;
  const margin = (useCost && revenueTotal > 0) ? Math.round((profitTotal / revenueTotal) * 10000) / 100 : null;

  return { invoiceCount, revenueTotal, costTotal, profitTotal, margin, qtyTotal, itemsArr, useCost };
}

function renderStats(stat) {
  setHidden('statLoading', true);
  setHidden('statEmpty', stat.itemsArr.length > 0);
  setHidden('statError', true);

  setText('statInvoiceCount', stat.invoiceCount);
  setText('statTotalRevenue', formatVND(Math.max(0, stat.revenueTotal)));
  setText('statTotalItemsQty', stat.qtyTotal);

  if (stat.useCost) {
    setText('statTotalCost', formatVND(Math.max(0, stat.costTotal)));
    setText('statTotalProfit', formatVND(Math.max(0, stat.profitTotal)));
    setText('statProfitMargin', (stat.margin ?? 0) + '%');
    setText('statHint', '* Vốn/lãi tính theo COST_MAP bạn khai báo.');
  } else {
    setText('statTotalCost', 'N/A');
    setText('statTotalProfit', 'N/A');
    setText('statProfitMargin', 'N/A');
    setText('statHint', '* Chưa có COST_MAP => chỉ tính doanh thu. Muốn tính lãi: khai báo giá vốn hoặc lưu cost vào invoice.');
  }

  const tbody = document.getElementById('statItemTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!stat.itemsArr.length) return;

  stat.itemsArr.forEach(it => {
    const revenue = Math.max(0, it.revenue || 0);
    const cost = Math.max(0, it.cost || 0);
    const profit = Math.max(0, it.profit || 0);
    const m = (stat.useCost && revenue > 0) ? Math.round((profit / revenue) * 10000) / 100 : null;

    const tr = document.createElement('tr');
    tr.style.borderTop = '1px solid #eef1f6';
    tr.innerHTML = `
      <td style="padding:10px;">${escapeHtml(it.name)}</td>
      <td style="padding:10px;">${it.qty}</td>
      <td style="padding:10px;">${formatVND(revenue)} ₫</td>
      <td style="padding:10px;">${stat.useCost ? (formatVND(cost) + ' ₫') : 'N/A'}</td>
      <td style="padding:10px;">${stat.useCost ? (formatVND(profit) + ' ₫') : 'N/A'}</td>
      <td style="padding:10px;">${stat.useCost ? ((m ?? 0) + '%') : 'N/A'}</td>
    `;
    tbody.appendChild(tr);
  });

  window.__LAST_STAT__ = stat;
}

function setQuickRange(days) {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));

  const yyyy = d => d.getFullYear();
  const mm = d => String(d.getMonth()+1).padStart(2,'0');
  const dd = d => String(d.getDate()).padStart(2,'0');

  document.getElementById('statFromDate') && (document.getElementById('statFromDate').value = `${yyyy(from)}-${mm(from)}-${dd(from)}`);
  document.getElementById('statToDate') && (document.getElementById('statToDate').value = `${yyyy(to)}-${mm(to)}-${dd(to)}`);
}

function downloadTextFile(filename, content, mime='text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert('Đã copy báo cáo.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    alert('Đã copy báo cáo.');
  }
}

function buildCSV(stat) {
  const lines = [];
  lines.push(['Mon','SoLuong','DoanhThu','Von','Lai','BienLai(%)'].join(','));
  stat.itemsArr.forEach(it => {
    const revenue = Math.max(0, it.revenue || 0);
    if (!stat.useCost) {
      lines.push([`"${String(it.name).replace(/"/g,'""')}"`, it.qty, revenue, '', '', ''].join(','));
    } else {
      const cost = Math.max(0, it.cost || 0);
      const profit = Math.max(0, it.profit || 0);
      const m = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;
      lines.push([`"${String(it.name).replace(/"/g,'""')}"`, it.qty, revenue, cost, profit, m].join(','));
    }
  });
  return lines.join('\n');
}

function buildText(stat) {
  const lines = [];
  lines.push(`THONG KE (DA THANH TOAN)`);
  lines.push(`So hoa don: ${stat.invoiceCount}`);
  lines.push(`Tong doanh thu: ${formatVND(stat.revenueTotal)} ₫`);
  if (stat.useCost) {
    lines.push(`Tong von: ${formatVND(stat.costTotal)} ₫`);
    lines.push(`Tong lai: ${formatVND(stat.profitTotal)} ₫`);
    lines.push(`Bien lai: ${stat.margin ?? 0}%`);
  } else {
    lines.push(`Tong von: N/A`);
    lines.push(`Tong lai: N/A`);
    lines.push(`Bien lai: N/A`);
  }
  lines.push('');
  lines.push('THEO MON:');
  stat.itemsArr.slice(0, 50).forEach((it, i) => {
    if (stat.useCost) lines.push(`${i+1}. ${it.name} | SL=${it.qty} | DT=${formatVND(it.revenue)} | Lai=${formatVND(it.profit)}`);
    else lines.push(`${i+1}. ${it.name} | SL=${it.qty} | DT=${formatVND(it.revenue)}`);
  });
  return lines.join('\n');
}

async function runStats(client) {
  setHidden('statError', true);
  setHidden('statEmpty', true);
  setHidden('statLoading', false);

  try {
    const fromDate = parseDateInput(document.getElementById('statFromDate')?.value);
    const toDate = parseDateInput(document.getElementById('statToDate')?.value);

    const rows = await fetchAllPaidInvoices(client);
    const stat = calcStats(rows, fromDate, toDate);

    renderStats(stat);
  } catch (err) {
    console.error(err);
    setHidden('statLoading', true);
    const box = document.getElementById('statError');
    if (box) {
      box.textContent = 'Không tính được thống kê: ' + (err.message || err);
      box.classList.remove('hidden');
    }
  }
}

export function initStats({ client }) {
  const btn = document.getElementById('showStatisticalBtn');
  const back = document.getElementById('statBackdrop');

  btn?.addEventListener('click', async () => {
    openStatModal();
    // default: hôm nay
    if (!document.getElementById('statFromDate')?.value && !document.getElementById('statToDate')?.value) {
      setQuickRange(1);
    }
    await runStats(client);
  });

  document.getElementById('closeStatModal')?.addEventListener('click', closeStatModal);
  document.getElementById('statCloseBtn')?.addEventListener('click', closeStatModal);

  back?.addEventListener('click', (e) => { if (e.target === back) closeStatModal(); });

  document.addEventListener('keydown', (e) => {
    const isOpen = back && !back.classList.contains('hidden');
    if (isOpen && e.key === 'Escape') closeStatModal();
  });

  document.getElementById('statRefreshBtn')?.addEventListener('click', () => runStats(client));
  document.getElementById('statQuickToday')?.addEventListener('click', async () => { setQuickRange(1); await runStats(client); });
  document.getElementById('statQuick7d')?.addEventListener('click', async () => { setQuickRange(7); await runStats(client); });
  document.getElementById('statQuick30d')?.addEventListener('click', async () => { setQuickRange(30); await runStats(client); });

  document.getElementById('statExportBtn')?.addEventListener('click', () => {
    const stat = window.__LAST_STAT__;
    if (!stat) return alert('Chưa có dữ liệu thống kê.');
    downloadTextFile('thong_ke.csv', buildCSV(stat), 'text/csv;charset=utf-8');
  });

  document.getElementById('statCopyBtn')?.addEventListener('click', async () => {
    const stat = window.__LAST_STAT__;
    if (!stat) return alert('Chưa có dữ liệu thống kê.');
    await copyToClipboard(buildText(stat));
  });
}

