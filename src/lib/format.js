// Formatting helpers. Dates inside the model are whole-day offsets from today
// (0 = today, -7 = a week ago, 23 = in 23 days); these turn them into labels.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function money(n, dp = 2) {
  const v = Number(n || 0);
  const s = '$' + Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return v < 0 ? '−' + s : s;
}
export const money0 = (n) => money(n, 0);
export const kfmt = (n) => (Math.abs(n) >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : money0(n));

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
  if (off === 1) return 'Tomorrow';
  if (off === -1) return 'Yesterday';
  const d = dateFromOffset(off, today);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
export function dateParts(off, today) {
  const d = dateFromOffset(off, today);
  return { dow: DOW[d.getDay()].toUpperCase(), day: d.getDate(), mon: MON[d.getMonth()].toUpperCase() };
}
export function whenDue(off) {
  if (off < 0) return `${-off} day${off === -1 ? '' : 's'} overdue`;
  if (off === 0) return 'Due today';
  if (off === 1) return 'Due tomorrow';
  return `Due in ${off} days`;
}
export const monthName = (i) => MON[((i % 12) + 12) % 12];
export function todayLabel(d = new Date()) { return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; }
