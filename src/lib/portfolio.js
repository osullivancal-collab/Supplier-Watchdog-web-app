// Portfolio numbers worked out from bills alone: GST to claim, the EOM
// cut-off, payment record, money coming back, concentration, jobs, a bill
// calendar, the supplier heatmap layout and a year in review.
//
// Bills use day offsets from today (see model.js): issued, due, paid (null =
// owed). Credits are negative totals. Pending (unconfirmed) bills are never
// passed in here, so nothing unconfirmed is counted.

import { dayOffset, dueFromTerms } from './model.js';

const round2 = (n) => Math.round(n * 100) / 100;
const sum = (xs, f = (x) => x) => xs.reduce((t, x) => t + f(x), 0);
const dateAt = (off, today) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + off);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// GST to claim this BAS quarter (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun).
// Uses the GST printed on the bill when it was read; otherwise a tenth of the
// pre-GST amount (total ÷ 11), flagged as an estimate because some items are
// GST-free. Quarterly lodgers are due on the 28th of the month after the
// quarter, except Oct–Dec, which is due 28 February.
// ---------------------------------------------------------------------------
export function basQuarter(today = new Date()) {
  const q = Math.floor(today.getMonth() / 3);           // 0 = Jan–Mar
  const start = new Date(today.getFullYear(), q * 3, 1);
  const end = new Date(today.getFullYear(), q * 3 + 3, 0);
  const lodge = q === 3 ? new Date(today.getFullYear() + 1, 1, 28) : new Date(today.getFullYear(), q * 3 + 3, 28);
  return { start, end, lodge, label: `${MON[q * 3]}–${MON[q * 3 + 2]}` };
}

export function gstToClaim(bills, today = new Date()) {
  const q = basQuarter(today);
  const from = dayOffset(q.start, today), to = 0;
  const inQ = bills.filter((b) => b.issued >= from && b.issued <= to);
  const estimated = inQ.filter((b) => typeof b.gst !== 'number');
  const amount = sum(inQ, (b) => (typeof b.gst === 'number' ? Math.sign(b.total) * Math.abs(b.gst) : b.total / 11));
  return { amount: round2(amount), count: inQ.length, estimated: estimated.length, label: q.label, lodge: q.lodge, lodgeIn: dayOffset(q.lodge, today) };
}

// ---------------------------------------------------------------------------
// The EOM cut-off. On "30 days EOM" a bill dated today is due at the end of
// next month; dated on the 1st it is due a month later. So a big order placed
// after the cut-off gets about a month more credit.
// ---------------------------------------------------------------------------
export function eomCutoff(suppliers, today = new Date()) {
  const onEom = suppliers.filter((s) => /EOM/.test(s.terms || ''));
  const daysLeft = dayOffset(new Date(today.getFullYear(), today.getMonth() + 1, 0), today);
  const terms = onEom.find((s) => s.terms === '30 days EOM') ? '30 days EOM' : 'EOM';
  const creditToday = dueFromTerms(0, terms, today);
  const creditFirst = dueFromTerms(daysLeft + 1, terms, today) - (daysLeft + 1);
  return { daysLeft, suppliers: onEom.map((s) => s.name), extraDays: Math.max(0, creditFirst - creditToday), creditToday, creditFirst };
}

// ---------------------------------------------------------------------------
// Payment record: share of account bills paid by their due date over the last
// year, and the current run of on-time payments. Cash sales and credits don't count.
// ---------------------------------------------------------------------------
export function paymentRecord(bills) {
  const paid = bills.filter((b) => b.paid != null && b.total > 0 && b.due > b.issued && b.paid > -365)
    .sort((a, b) => b.paid - a.paid || b.due - a.due);
  const onTime = paid.filter((b) => b.paid <= b.due);
  let streak = 0;
  for (const b of paid) { if (b.paid <= b.due) streak += 1; else break; }
  const late = paid.filter((b) => b.paid > b.due);
  return {
    paidCount: paid.length,
    onTimePct: paid.length ? Math.round((onTime.length / paid.length) * 100) : null,
    streak,
    lateCount: late.length,
    avgDaysLate: late.length ? Math.round(sum(late, (b) => b.paid - b.due) / late.length) : 0,
    overdueNow: bills.filter((b) => b.paid == null && b.total > 0 && b.due < 0).length,
  };
}

// ---------------------------------------------------------------------------
// "Dividends": money coming back. Credits from returns in the last year, and
// credits still sitting on an account waiting to be used.
// ---------------------------------------------------------------------------
export function moneyBack(bills) {
  const credits = bills.filter((b) => b.total < 0 && b.issued > -365);
  const unused = credits.filter((b) => b.paid == null);
  return {
    credits: round2(-sum(credits, (b) => b.total)), count: credits.length,
    unused: round2(-sum(unused, (b) => b.total)), unusedCount: unused.length, unusedBills: unused,
  };
}

// ---------------------------------------------------------------------------
// Concentration (like portfolio diversification). HHI over supplier shares:
// over 2,500 is concentrated. For a tradie that's leverage, not risk.
// ---------------------------------------------------------------------------
export function concentration(ranked) {
  const active = ranked.filter((s) => s.spend > 0);
  const hhi = Math.round(sum(active, (s) => s.share * s.share));
  const top = active[0] || null;
  const label = hhi >= 2500 ? 'Concentrated' : hhi >= 1500 ? 'Leaning' : 'Spread out';
  return { hhi, label, top, topShare: top ? top.share : 0, count: active.length };
}

// ---------------------------------------------------------------------------
// Jobs as positions: what each job has cost in materials, when it last moved,
// and a 12-week spark of its spend.
// ---------------------------------------------------------------------------
export function jobStats(bills) {
  const byJob = new Map();
  for (const b of bills) {
    if (!b.job) continue;
    if (!byJob.has(b.job)) byJob.set(b.job, []);
    byJob.get(b.job).push(b);
  }
  return [...byJob.entries()].map(([job, bs]) => {
    const weeks = Array.from({ length: 12 }, (_, i) => round2(sum(bs.filter((b) => b.issued > -(12 - i) * 7 && b.issued <= -(11 - i) * 7), (b) => b.total)));
    const last30 = sum(bs.filter((b) => b.issued > -30), (b) => b.total);
    const prev30 = sum(bs.filter((b) => b.issued > -60 && b.issued <= -30), (b) => b.total);
    const suppliers = [...new Set(bs.map((b) => b.supplierId || b.vendor))];
    return {
      job, spend: round2(sum(bs, (b) => b.total)), count: bs.length,
      owed: round2(sum(bs.filter((b) => b.paid == null), (b) => b.total)),
      first: Math.min(...bs.map((b) => b.issued)), last: Math.max(...bs.map((b) => b.issued)),
      last30: round2(last30), change: prev30 ? ((last30 - prev30) / prev30) * 100 : 0,
      weeks, suppliers,
    };
  }).sort((a, b) => b.last - a.last || b.spend - a.spend);
}

// ---------------------------------------------------------------------------
// Bill calendar: a month grid (Mon-first weeks) with what falls due each day.
// ---------------------------------------------------------------------------
export function monthGrid(bills, year, month, today = new Date()) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;                // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    const off = dayOffset(new Date(year, month, d), today);
    const due = bills.filter((b) => b.paid == null && b.total > 0 && b.due === off);
    cells.push({ day: d, off, due, total: round2(sum(due, (b) => b.total)) });
  }
  while (cells.length % 7) cells.push(null);
  const max = Math.max(1, ...cells.filter(Boolean).map((c) => c.total));
  return { cells, max, label: `${MON[month]} ${year}`, total: round2(sum(cells.filter(Boolean), (c) => c.total)) };
}

// ---------------------------------------------------------------------------
// Heatmap layout: squarified treemap (Bruls et al.), so tiles stay close to
// square and big spenders get big tiles. Returns rectangles in a w × h box.
// ---------------------------------------------------------------------------
export function treemap(items, w, h) {
  const total = sum(items, (x) => x.value);
  if (!total || !items.length) return [];
  const scale = (w * h) / total;
  const queue = [...items].sort((a, b) => b.value - a.value).map((x) => ({ ...x, area: x.value * scale }));
  const out = [];
  let x = 0, y = 0, rw = w, rh = h;
  const worst = (row, side) => {
    const s = sum(row, (r) => r.area);
    const max = Math.max(...row.map((r) => r.area)), min = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const place = (row) => {
    const s = sum(row, (r) => r.area);
    if (rw >= rh) {                                      // lay the row down the left side
      const cw = s / rh; let cy = y;
      for (const r of row) { const ch = r.area / cw; out.push({ ...r, x, y: cy, w: cw, h: ch }); cy += ch; }
      x += cw; rw -= cw;
    } else {                                             // lay the row across the top
      const ch = s / rw; let cx = x;
      for (const r of row) { const cw = r.area / ch; out.push({ ...r, x: cx, y, w: cw, h: ch }); cx += cw; }
      y += ch; rh -= ch;
    }
  };
  let row = [];
  while (queue.length) {
    const next = queue[0];
    const side = Math.min(rw, rh);
    if (!row.length || worst([...row, next], side) <= worst(row, side)) { row.push(queue.shift()); }
    else { place(row); row = []; }
  }
  if (row.length) place(row);
  return out;
}

// ---------------------------------------------------------------------------
// Year in review: the last 12 months in a few big numbers.
// ---------------------------------------------------------------------------
export function yearReview(bills, suppliers, today = new Date()) {
  const year = bills.filter((b) => b.issued > -365);
  const spendBills = year.filter((b) => b.total > 0);
  const nameOf = (b) => b.vendor || suppliers.find((s) => s.id === b.supplierId)?.name || 'Other';
  const bySup = new Map();
  for (const b of spendBills) bySup.set(nameOf(b), (bySup.get(nameOf(b)) || 0) + b.total);
  const top = [...bySup.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const byMonth = new Map();
  for (const b of spendBills) {
    const d = dateAt(b.issued, today);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    byMonth.set(k, (byMonth.get(k) || 0) + b.total);
  }
  const busiest = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  const biggest = [...spendBills].sort((a, b) => b.total - a.total)[0] || null;
  const spend = sum(spendBills, (b) => b.total);
  return {
    spend: round2(spend), count: year.length, perWeek: round2(spend / 52),
    top: top ? { name: top[0], spend: round2(top[1]), share: (top[1] / (spend || 1)) * 100 } : null,
    busiest: busiest ? { label: MON[Number(busiest[0].split('-')[1])], spend: round2(busiest[1]) } : null,
    biggest: biggest ? { name: nameOf(biggest), total: biggest.total, ref: biggest.ref } : null,
    suppliers: bySup.size,
  };
}

/** Short ticker symbol: "Bunnings Trade" → BUNNINGS, "Tradelink" → TRADELINK. */
export const symbol = (name) => String(name || '').split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 9);

// ---------------------------------------------------------------------------
// Credit limit: a trade account's limit caps the unpaid balance. "Used" is
// everything unpaid with that supplier less unused credits. The forecast asks:
// at your normal buying pace (last 60 days), do you hit the limit before your
// next bill falls due and frees up room? Returns null when no limit is set.
// ---------------------------------------------------------------------------
export function creditUse(bills, supplier) {
  const limit = Number(supplier?.limit);
  if (!limit || limit <= 0) return null;
  const mine = bills.filter((b) => b.supplierId === supplier.id);
  const open = mine.filter((b) => b.paid == null);
  const used = Math.max(0, round2(sum(open, (b) => b.total)));
  const left = round2(limit - used);
  const pace = sum(mine.filter((b) => b.total > 0 && b.issued > -60), (b) => b.total) / 60; // $ a day
  const upcoming = open.filter((b) => b.total > 0 && b.due >= 0).sort((a, b) => a.due - b.due);
  const nextFree = upcoming.length
    ? { due: upcoming[0].due, amount: round2(sum(upcoming.filter((b) => b.due === upcoming[0].due), (b) => b.total)) }
    : null;
  const daysToLimit = left <= 0 ? 0 : pace > 0 ? Math.floor(left / pace) : null;
  const hitsFirst = daysToLimit != null && (!nextFree || daysToLimit < nextFree.due);
  const usedPct = Math.round((used / limit) * 100);
  const status = used > limit ? 'over' : usedPct >= 80 || (hitsFirst && daysToLimit <= 14) ? 'tight' : 'ok';
  return { id: supplier.id, name: supplier.name, limit, used, left, usedPct, pace: round2(pace), daysToLimit, nextFree, hitsFirst, status };
}

/** One line a tradie can act on. */
export function creditLine(c) {
  if (!c) return '';
  if (c.status === 'over') return `Over the limit by ${Math.round(c.used - c.limit).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}: expect the account to go on stop.`;
  if (c.hitsFirst && c.daysToLimit != null) {
    const when = c.daysToLimit === 0 ? 'today' : c.daysToLimit === 1 ? 'tomorrow' : `in ${c.daysToLimit} days`;
    const gap = c.nextFree ? c.nextFree.due - c.daysToLimit : null;
    return `At your usual pace you hit the limit ${when}${gap ? `, ${gap} day${gap === 1 ? '' : 's'} before your next payment frees up room` : ''}.`;
  }
  if (c.nextFree) return `${c.nextFree.amount.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })} frees up when you pay in ${c.nextFree.due} day${c.nextFree.due === 1 ? '' : 's'}.`;
  return 'Plenty of room.';
}
