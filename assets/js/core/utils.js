export function formatVND(num) {
  if (!isFinite(num)) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
}

export function parseRaw(val) {
  if (val == null) return 0;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9\-]/g, '');
    return parseInt(cleaned) || 0;
  }
  return Number(val) || 0;
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

export function getTodayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeDate(createdAt) {
  if (!createdAt) return null;
  if (typeof createdAt.toDate === 'function') return createdAt.toDate();
  if (typeof createdAt === 'number') return new Date(createdAt);
  if (typeof createdAt === 'string') {
    const d = new Date(createdAt);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

