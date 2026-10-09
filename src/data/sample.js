// =============================================================
// SAMPLE DATA — shaped exactly like the real records will be.
//
// Every number on screen is DERIVED from these lists by
// src/lib/model.js (owed balance, monthly spend, shares, bill
// shock, deal progress). When email-in is live, only the source
// of these lists changes — the screens and the maths do not.
//
// Dates are whole-day offsets from today (negative = past).
//   bill.issued  day the bill was dated
//   bill.due     day it is due
//   bill.paid    day it was paid; null = still owed
// =============================================================

export const business = {
  name: 'Site Crew Pty Ltd',
  owner: 'Mick Tucker',
  initials: 'MT',
  forwardAddress: 'mick.k7x2@in.watchdog.app',
};

export const suppliers = [
  { id: 'reece', name: 'Reece', terms: '30 days EOM', rep: 'Dave Mercer', phone: '03 9421 7780', account: 'RE-09887', branch: 'Reece Dandenong' },
  { id: 'tradelink', name: 'Tradelink', terms: '30 days', rep: 'Sandra Liu', phone: '03 9388 2210', account: 'TL-44120', branch: 'Tradelink Moorabbin' },
  { id: 'middys', name: 'Middys', terms: '30 days EOM', rep: 'Paul Nguyen', phone: '03 9555 1020', account: 'MD-30214', branch: 'Middys Oakleigh' },
  { id: 'rexel', name: 'Rexel', terms: '14 days', rep: '', phone: '13 73 95', account: 'RX-55102', branch: '' },
  { id: 'bunnings', name: 'Bunnings Trade', terms: 'COD', rep: 'Trade desk', phone: '1300 266 464', account: 'BT-77301', branch: '' },
];

const JOBS = ['Smith reno', 'Lot 12 Box Hill', 'Café fit-out', 'Unit 4 rewire'];

// Deterministic generator for a year of bills, so the charts have
// real-looking history. Each supplier bills on its own rhythm; Reece's bills
// grow over the year and Middys' shrink, which gives "top riser / top
// faller" something true to report. Bills are paid on their due date, so
// the ones issued in the last 30 days are still owed today.
const RHYTHM = [
  // id, ref prefix, every N days, typical bill, trend from a year ago → now
  ['reece', 'INV-', 3, 470, 0.8, 1.2],
  ['tradelink', 'TL-', 5, 420, 1.0, 1.02],
  ['middys', 'M-', 6, 400, 1.2, 0.85],
  ['rexel', 'RX-', 15, 330, 1.0, 1.0],
  ['bunnings', 'BT-', 4, 60, 1.05, 0.95], // paid by card on the day
];
function generateBills() {
  let seed = 777;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  let n = 40000;
  for (const [id, prefix, every, typical, from, to] of RHYTHM) {
    for (let d = -365 + Math.floor(rnd() * every); d <= -2; d += every + Math.floor(rnd() * 3) - 1) {
      const t = (d + 365) / 365;
      const total = Math.round(typical * (from + (to - from) * t) * (0.7 + rnd() * 0.6) * 100) / 100;
      const card = id === 'bunnings';
      const due = card ? d : d + 30;
      const job = rnd() < 0.7 ? JOBS[Math.floor(rnd() * JOBS.length)] : null;
      out.push({ id: 'g' + n, supplierId: id, ref: prefix + n++, total, issued: d, due, paid: card || due < 0 ? due : null, job });
    }
  }
  return out;
}

// A few one-offs on top of the rhythm: an overdue bill and two non-trade bills.
const extras = [
  { id: 'b1', supplierId: 'tradelink', ref: 'TL-2041', total: 1842.5, issued: -37, due: -7 },
  // Returns: one credit already used against a bill, one still sitting on the account.
  { id: 'c1', supplierId: 'reece', ref: 'CR-88120', total: -142.0, issued: -64, due: -64, paid: -60 },
  { id: 'c2', supplierId: 'middys', ref: 'MC-5521', total: -86.5, issued: -12, due: -12 },
  { id: 'b4', supplierId: null, vendor: 'Telstra', ref: 'TEL-OCT', total: 195.0, issued: -22, due: 8 },
  { id: 'b5', supplierId: null, vendor: 'CSR Gyprock', ref: 'CSR-2019', total: 760.4, issued: -19, due: 11 },
].map((b) => ({ paid: null, ...b }));

// Real tradies pay some bills late: every 9th account bill a few days over.
const generated = generateBills().map((b, i) => (b.paid != null && b.due !== b.issued && i % 9 === 4 && b.due + 4 < 0 ? { ...b, paid: b.due + 4 } : b));
export const bills = [...generated, ...extras];

// Bills read from email that the user has not confirmed yet. They count for
// nothing until confirmed. `confidence` is how sure the reader was.
export const reviewQueue = [
  { id: 'q1', supplierId: 'reece', ref: 'INV-88342', total: 1284.5, issued: -1, due: 23, paid: null, confidence: 99,
    flag: { kind: 'price', text: 'TPS 2.5 up 8.2% — Middys billed you $131' } },
  { id: 'q2', supplierId: 'middys', ref: 'M-55120', total: 642.1, issued: -1, due: 38, paid: null, confidence: 97, flag: null },
  { id: 'q3', supplierId: 'tradelink', ref: 'TL-90031', total: 2310.0, issued: 0, due: 22, paid: null, confidence: 81,
    flag: { kind: 'duplicate', text: 'Possible duplicate of TL-90012 — same supplier, 3 days apart' } },
];

// Unit prices pulled from invoice line items. `history` is what YOU paid on
// your last invoices (oldest first); `latest` is each supplier's most recent
// price to you. `qtyPerQuarter` weights the Basket Index and the
// "paid over your best price" sums.
export const items = [
  { id: 'tps', name: 'TPS 2.5mm² 2C+E · 100m', unit: 'per roll', qtyPerQuarter: 24,
    history: [131, 131, 133, 133, 136, 136, 142, 142], latest: { reece: 142.0, tradelink: 138.5, middys: 131.0 } },
  { id: 'copper', name: 'Copper tube 15mm · 5.5m', unit: 'per length', qtyPerQuarter: 12,
    history: [55.1, 55.1, 56.9, 58.2, 58.2, 60.4, 61.2, 61.5], latest: { tradelink: 61.2, reece: 64.8 } },
  { id: 'gpo', name: 'Clipsal Iconic double GPO', unit: 'each', qtyPerQuarter: 60,
    history: [18.3, 18.3, 18.3, 18.6, 18.6, 18.9, 18.9, 18.9], latest: { reece: 18.9, rexel: 18.1, middys: 17.4 } },
  { id: 'rcbo', name: 'RCBO 20A 1P+N 6kA', unit: 'each', qtyPerQuarter: 18,
    history: [47.9, 47.9, 47.9, 47.2, 46.8, 46.8, 46.8, 46.8], latest: { reece: 46.8, tradelink: 44.2, middys: 49.9 } },
  { id: 'conduit', name: 'PVC conduit 25mm · 4m', unit: 'per length', qtyPerQuarter: 40,
    history: [6.95, 6.95, 6.95, 6.95, 6.95, 6.95, 6.95, 6.95], latest: { bunnings: 6.95, reece: 7.4 } },
];

// Deals agreed at the counter. Progress is never stored — it is worked out
// from bills issued between `start` and `end`.
export const deals = [
  { id: 'd1', supplierId: 'middys', kind: 'share', target: 25, reward: 'Milwaukee Packout', start: -20, end: 23, rep: 'Paul N.' },
  { id: 'd2', supplierId: 'reece', kind: 'spend', target: 5000, reward: '$200 account credit', start: -20, end: 23, rep: 'Dave M.' },
];

export const pastDeals = [
  { name: 'Bunnings · under 5%', meta: 'finished at 4%', won: true },
  { name: 'Tradelink · 50% share', meta: 'reached 42%', won: false },
  { name: 'Reece · 25% share', meta: 'hit 28% · discount code', won: true },
];

export const rebate = { supplierId: 'reece', rate: 0.03, threshold: 80000 };
