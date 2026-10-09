// Pure calculations. Nothing here touches React, storage or the network, so
// every number the app shows can be unit-tested (see model.test.js).
//
// A bill is outstanding from the day it is issued until the day it is paid.
// `paid === null` means it is still owed.

const owedOn = (b, day) => b.issued <= day && (b.paid == null || day < b.paid);

/** Daily owed balance from `from` (negative offset) to today, plus what happened each day. */
export function owedSeries(bills, from) {
  const out = [];
  for (let day = from; day <= 0; day++) {
    let owed = 0;
    const ins = [], outs = [];
    for (const b of bills) {
      if (owedOn(b, day)) owed += b.total;
      if (b.issued === day) ins.push(b);
      if (b.paid === day) outs.push(b);
    }
    out.push({ day, owed: round2(owed), ins, outs });
  }
  return out;
}

/**
 * What will still be owed on each of the next `days` days if every open bill is
 * paid on its due date and nothing new arrives. Overdue bills are assumed to go
 * out tomorrow. This is the "cash going out" half of the chart.
 */
export function aheadSeries(bills, days = 35) {
  const open = bills.filter((b) => b.paid == null);
  const start = open.reduce((t, b) => t + b.total, 0);
  const out = [];
  for (let t = 0; t <= days; t++) {
    const due = open.filter((b) => Math.max(b.due, 1) === t);
    const gone = open.filter((b) => Math.max(b.due, 1) <= t).reduce((s, b) => s + b.total, 0);
    out.push({ day: t, owed: round2(Math.max(0, start - gone)), due });
  }
  return out;
}

export const openBills = (bills) => bills.filter((b) => b.paid == null).sort((a, b) => a.due - b.due);
export const totalOwed = (bills) => round2(openBills(bills).reduce((t, b) => t + b.total, 0));

/**
 * Bill shock: how the next 30 days compare with a normal 30 days.
 * "Normal" = average amount that fell due per 30 days over the last 180 days.
 * 50 = exactly normal; each 10% above normal adds 7 points. Clamped 0–100.
 */
export function billShock(bills) {
  const next30 = openBills(bills).filter((b) => b.due <= 30).reduce((t, b) => t + b.total, 0);
  const pastDue = bills.filter((b) => b.due >= -180 && b.due < 0).reduce((t, b) => t + b.total, 0);
  const normal = pastDue / 6 || 1;
  const ratio = next30 / normal;
  const score = clamp(Math.round(50 + (ratio - 1) * 70), 0, 100);
  const label = score < 40 ? 'Low' : score < 60 ? 'Normal' : score < 80 ? 'High' : 'Critical';
  return { score, label, next30: round2(next30), normal: round2(normal), ratio };
}

/** Spend per calendar month for the last `n` months (oldest first). Uses issue date. */
export function monthlySpend(bills, n = 6, today = new Date()) {
  const rows = [];
  for (let k = n - 1; k >= 0; k--) {
    const first = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const next = new Date(today.getFullYear(), today.getMonth() - k + 1, 1);
    const a = dayOffset(first, today), b = dayOffset(next, today);
    const total = bills.filter((x) => x.issued >= a && x.issued < b).reduce((t, x) => t + x.total, 0);
    rows.push({ month: first.getMonth(), year: first.getFullYear(), total: round2(total), current: k === 0 });
  }
  return rows;
}

/**
 * Month-end forecast: what has been billed so far this month plus the average
 * daily spend of the last 90 days for the days that are left.
 */
export function monthForecast(bills, today = new Date()) {
  const first = dayOffset(new Date(today.getFullYear(), today.getMonth(), 1), today);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const left = daysInMonth - today.getDate();
  const soFar = bills.filter((b) => b.issued >= first && b.issued <= 0).reduce((t, b) => t + b.total, 0);
  const daily = bills.filter((b) => b.issued > -90 && b.issued <= 0).reduce((t, b) => t + b.total, 0) / 90;
  return round2(soFar + daily * left);
}

/** Per-supplier figures, ranked by spend in the last 90 days. */
export function supplierStats(bills, suppliers, today = new Date()) {
  const total90 = bills.filter((b) => b.supplierId && b.issued > -90).reduce((t, b) => t + b.total, 0) || 1;
  return suppliers
    .map((s) => {
      const mine = bills.filter((b) => b.supplierId === s.id);
      const last90 = mine.filter((b) => b.issued > -90);
      const prev90 = mine.filter((b) => b.issued > -180 && b.issued <= -90);
      const spend = sum(last90), prev = sum(prev90);
      const months = monthlySpend(mine, 8, today).map((m) => m.total);
      return {
        ...s,
        spend: round2(spend),
        change: prev ? ((spend - prev) / prev) * 100 : 0,
        share: (spend / total90) * 100,
        billCount: last90.length,
        avgBill: last90.length ? spend / last90.length : 0,
        months,
      };
    })
    .sort((a, b) => b.spend - a.spend)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/** A deal's progress, worked out from bills issued inside the deal's window. */
export function dealProgress(deal, bills) {
  const inWindow = bills.filter((b) => b.supplierId && b.issued >= deal.start && b.issued <= Math.min(0, deal.end));
  const theirs = sum(inWindow.filter((b) => b.supplierId === deal.supplierId));
  if (deal.kind === 'share') {
    const share = inWindow.length ? (theirs / (sum(inWindow) || 1)) * 100 : 0;
    return { value: share, pct: clamp(Math.round((share / deal.target) * 100), 0, 100), daysLeft: Math.max(0, deal.end) };
  }
  return { value: round2(theirs), pct: clamp(Math.round((theirs / deal.target) * 100), 0, 100), daysLeft: Math.max(0, deal.end) };
}

/** How much more you paid a supplier than your own best price elsewhere, per quarter. */
export function overpay(items, supplierId) {
  let total = 0;
  const lines = [];
  for (const it of items) {
    const mine = it.latest[supplierId];
    if (mine == null) continue;
    const [bestId, best] = bestPrice(it);
    if (mine > best + 0.001) {
      total += (mine - best) * it.qtyPerQuarter;
      lines.push({ item: it, bestId, best, mine, gapPct: ((mine - best) / best) * 100 });
    }
  }
  return { total: round2(total), lines };
}

export function bestPrice(item) {
  return Object.entries(item.latest).sort((a, b) => a[1] - b[1])[0];
}

export const itemChange = (item) => ((item.history.at(-1) - item.history[0]) / item.history[0]) * 100;

/** Your own inflation: quantity-weighted change of the items you keep buying. 100 = no change. */
export function basketIndex(items) {
  let then = 0, now = 0;
  for (const it of items) { then += it.history[0] * it.qtyPerQuarter; now += it.history.at(-1) * it.qtyPerQuarter; }
  return then ? (now / then) * 100 : 100;
}

export function dayOffset(date, today = new Date()) {
  const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 864e5);
}

const sum = (list) => list.reduce((t, b) => t + b.total, 0);
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------------------
// Payment terms → due date. Offsets are days from today.
//   COD / Card      paid on the day
//   7 / 14 / 30 days  that many days after the bill date
//   EOM             end of the month the bill is dated in
//   30 days EOM     end of the following month (how most wholesalers bill)
// ---------------------------------------------------------------------------
export const TERMS = ['COD', '7 days', '14 days', '30 days', 'EOM', '30 days EOM'];

export function dueFromTerms(issued, terms, today = new Date()) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + issued);
  switch (terms) {
    case 'COD': case 'Card': return issued;
    case '7 days': return issued + 7;
    case '14 days': return issued + 14;
    case '30 days': return issued + 30;
    case 'EOM': return dayOffset(new Date(date.getFullYear(), date.getMonth() + 1, 0), today);
    case '30 days EOM': return dayOffset(new Date(date.getFullYear(), date.getMonth() + 2, 0), today);
    default: return issued + 30;
  }
}
export const isCashTerms = (terms) => terms === 'COD' || terms === 'Card';

/**
 * Spend in the 30 days up to each day — a supplier's "price" line. It only
 * moves when one of their bills is dated (or drops out of the window), so it
 * is drawn as steps. Returns `days + 1` values ending today.
 */
export function rollingSpend(bills, supplierId, days = 90, window = 30) {
  const mine = supplierId ? bills.filter((b) => b.supplierId === supplierId) : bills.filter((b) => b.supplierId);
  const daily = new Map();
  for (const b of mine) daily.set(b.issued, (daily.get(b.issued) || 0) + b.total);
  const first = -days - window + 1;
  const out = [];
  let run = 0;
  for (let d = first; d <= 0; d++) {
    run += daily.get(d) || 0;
    // Only take a bill back out of the window if it was counted in the first place.
    if (d - window >= first) run -= daily.get(d - window) || 0;
    if (d >= -days) out.push(round2(run));
  }
  return out;
}

/** What is owed to one supplier right now, and their next due bill. */
export function supplierPosition(bills, supplierId) {
  const open = openBills(bills).filter((b) => b.supplierId === supplierId);
  return { owed: round2(sum(open)), next: open.find((b) => b.due >= 0) || open[0] || null, open };
}

/** Effect of a purchase you're about to make: where it lands and what it does to bill shock. */
export function previewPurchase(bills, { supplierId, amount, terms }, today = new Date()) {
  const due = dueFromTerms(0, terms, today);
  const bill = { id: 'preview', supplierId, total: amount, issued: 0, due, paid: isCashTerms(terms) ? 0 : null };
  const before = billShock(bills), after = billShock([...bills, bill]);
  return { due, before, after, owedBefore: totalOwed(bills), owedAfter: totalOwed([...bills, bill]) };
}

// ---------------------------------------------------------------------------
// Dot chart buckets: one dot = one day (1M), one week (3M, 6M) or one month
// (1Y). Past dots are what was billed in that period; dots ahead of today are
// what falls due in that period (overdue bills count as going out tomorrow).
// ---------------------------------------------------------------------------
export function spendBuckets(bills, range, { supplierId = null, today = new Date() } = {}) {
  const mine = supplierId ? bills.filter((b) => b.supplierId === supplierId) : bills;
  const open = mine.filter((b) => b.paid == null);
  const billed = (from, to) => summarise(mine.filter((b) => b.issued >= from && b.issued <= to), from, to);
  const due = (from, to) => summarise(open.filter((b) => Math.max(b.due, 1) >= from && Math.max(b.due, 1) <= to), from, to);
  const past = [], ahead = [];
  let unit;
  if (range === '1M') {
    unit = 'day';
    for (let d = -29; d <= 0; d++) past.push(billed(d, d));
    for (let d = 1; d <= 10; d++) ahead.push(due(d, d));
  } else if (range === '1Y') {
    unit = 'month';
    for (let m = 11; m >= 0; m--) {
      const from = dayOffset(new Date(today.getFullYear(), today.getMonth() - m, 1), today);
      const end = dayOffset(new Date(today.getFullYear(), today.getMonth() - m + 1, 0), today);
      // `full` = days in the month, so a part-month can be compared at its pace.
      past.push({ ...billed(from, Math.min(0, end)), full: end - from + 1 });
    }
    const endThis = dayOffset(new Date(today.getFullYear(), today.getMonth() + 1, 0), today);
    const endNext = dayOffset(new Date(today.getFullYear(), today.getMonth() + 2, 0), today);
    ahead.push(due(1, Math.max(1, endThis)), due(endThis + 1, endNext));
  } else {
    unit = 'week';
    const n = range === '6M' ? 26 : 13;
    for (let w = n - 1; w >= 0; w--) past.push(billed(-7 * w - 6, -7 * w));
    for (let w = 0; w < 5; w++) ahead.push(due(1 + 7 * w, 7 + 7 * w));
  }
  const done = past.slice(0, -1).map((p) => p.total);
  const avg = done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0;
  let streak = 0;
  for (let i = done.length - 1; i >= 0 && done[i] < avg; i--) streak++;
  return { unit, past, ahead, avg: round2(avg), streak };
}

function summarise(list, from, to) {
  const by = {};
  for (const b of list) { const k = b.supplierId || b.vendor || 'other'; by[k] = (by[k] || 0) + b.total; }
  const top = Object.keys(by).sort((a, b) => by[b] - by[a])[0] || null;
  return { from, to, total: round2(sum(list)), count: list.length, top, bills: list };
}

/**
 * Likely double-billing: same supplier, same amount (to the cent), dated within
 * a week of each other, different bills. Credits are ignored.
 */
export function findDuplicates(bills) {
  const out = [];
  const list = bills.filter((b) => b.supplierId && b.total > 0).sort((a, b) => a.issued - b.issued);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j].issued - list[i].issued <= 7; j++) {
      const a = list[i], b = list[j];
      if (a.supplierId === b.supplierId && Math.abs(a.total - b.total) < 0.005 && a.id !== b.id && (a.ref || '') !== (b.ref || 'x')) {
        out.push({ a, b });
      }
    }
  }
  return out;
}

/** Everything Watchdog has caught: price creep against your own best price, and likely double-bills. */
export function catches({ bills, items, suppliers }) {
  const out = [];
  for (const s of suppliers) {
    for (const l of overpay(items, s.id).lines) {
      out.push({
        id: `price-${s.id}-${l.item.id}`, kind: 'price', supplierId: s.id, amount: round2((l.mine - l.best) * l.item.qtyPerQuarter),
        item: l.item, mine: l.mine, best: l.best, bestId: l.bestId,
      });
    }
  }
  for (const { a, b } of findDuplicates(bills)) {
    out.push({ id: `dup-${a.id}-${b.id}`, kind: 'duplicate', supplierId: b.supplierId, amount: b.total, a, b });
  }
  return out.sort((x, y) => y.amount - x.amount);
}
