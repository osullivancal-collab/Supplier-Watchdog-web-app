// Formatting helpers. All dates in the app are whole-day offsets from today
// (0 = today, -7 = a week ago, 23 = in 23 days); these turn them into labels.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function money(n, dp = 2) {
  return '$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export const money0 = (n) => money(n, 0);
export const kfmt = (n) => '$' + (n / 1000).toFixed(1) + 'k';

export function pct(n) {
  if (!Number.isFinite(n)) return '—';
  return (n > 0.05 ? '▲ ' : n < -0.05 ? '▼ ' : '') + Math.abs(n).toFixed(1) + '%';
}

/** Spending up is bad (orange), spending down is good (blue). */
export const dirClass = (n) => (n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat');

export function dateFromOffset(off, today = new Date()) {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + off);
}
export function dayLabel(off, today) {
  if (off === 0) return 'Today';
  const d = dateFromOffset(off, today);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
export const monthName = (i) => MON[((i % 12) + 12) % 12];
