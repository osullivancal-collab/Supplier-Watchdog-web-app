export const fmt = (n) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);

export const fDate = (iso) =>
  iso ? new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short' }).format(new Date(iso)) : '—';

// Demo "today" so the mock dates line up sensibly.
const TODAY = new Date('2026-06-19');
export const daysUntil = (iso) => Math.round((+new Date(iso) - +TODAY) / 86400000);

// Whole-dollar format (no cents) for compact sub-totals.
export const fmt0 = (n) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

// Helpers for the merged charts/holdings.
export const totalOf = (h) => h.reduce((a, b) => a + b, 0);
export const pctChange = (h) => {
  if (!h || h.length < 2) return null;
  const a = h[h.length - 1], b = h[h.length - 2];
  if (!b) return null;
  return Math.round(((a - b) / b) * 100);
};

// Bill Shock Score — how far above rolling average is current exposure?
// Returns { score 1-99, label, color, emoji, avg, pct, rank }.
export function billShockScore(likelyReal, history) {
  const avg = history.reduce((s, v) => s + v, 0) / history.length;
  if (!avg) return { score: 0, label: 'Low', color: 'var(--safe)', emoji: '🟢', rank: null, avg: 0, pct: 0, headline: '🟢 Comfortable', sub: 'Not enough history yet.', monthsHigher: 0 };
  const pct = ((likelyReal - avg) / avg) * 100;
  const monthsHigher = history.filter((v) => v > likelyReal).length;

  let score, label, color, emoji;
  if (pct <= 0)       { score = Math.max(5, 30 + pct);             label = 'Low';           color = 'var(--safe)';   emoji = '🟢'; }
  else if (pct <= 20) { score = Math.round(30 + pct * 0.75);       label = 'Low–Moderate';  color = 'var(--safe)';   emoji = '🟢'; }
  else if (pct <= 50) { score = Math.round(45 + (pct - 20));       label = 'Moderate';      color = 'var(--amber)';  emoji = '🟠'; }
  else if (pct <= 90) { score = Math.round(75 + (pct - 50) * 0.25);label = 'High';          color = 'var(--danger)'; emoji = '🔴'; }
  else                { score = Math.min(99, Math.round(85 + (pct - 90) * 0.15)); label = 'Critical'; color = 'var(--danger)'; emoji = '🔴'; }
  score = Math.min(99, Math.max(1, score));

  let rank = null;
  if (monthsHigher === 0 && history.length > 1) rank = `Highest in ${history.length} months`;
  else if (monthsHigher === 1) rank = 'Second highest on record';
  else if (monthsHigher <= 2 && history.length >= 4) rank = 'Well above your usual';

  // Sentence-first headline + sub (viewer parity)
  let headline, sub;
  if (pct <= 0)        { headline = '🟢 Comfortable';                    sub = 'Below your monthly average — easy month.'; }
  else if (pct <= 20)  { headline = '🟠 Slightly above normal';          sub = `About ${Math.round(pct)}% over your average.`; }
  else if (pct <= 50)  { headline = '🟠 Higher than usual';              sub = `Around ${Math.round(pct)}% above your average month.`; }
  else if (pct <= 90)  { headline = monthsHigher === 0 ? `🔴 Biggest month in ${history.length} months` : '🔴 Well above average'; sub = `${Math.round(pct)}% over your typical spend.`; }
  else                 { headline = '🔴 Highest month on record';        sub = `${Math.round(pct)}% above your average — brace for it.`; }

  return { score, label, color, emoji, avg, pct: Math.round(pct), rank, headline, sub, monthsHigher };
}

// Compute Top Riser and Top Faller from spendHistory (id-keyed object).
// Returns { riser: { name, pct }, faller: { name, pct } }.
export function riserFaller(spendHistory, nameMap) {
  const withChange = Object.entries(spendHistory)
    .filter(([, h]) => h.length >= 2 && h[h.length - 2] > 0)
    .map(([id, h]) => {
      const cur = h[h.length - 1];
      const prev = h[h.length - 2];
      const pct = Math.round(((cur - prev) / prev) * 100);
      return { name: (nameMap[id] || id).split(' ')[0], pct };
    });
  const sorted = [...withChange].sort((a, b) => b.pct - a.pct);
  return { riser: sorted[0] ?? null, faller: sorted[sorted.length - 1] ?? null };
}

// Forecast: extrapolate this month's spend from progress, compare to average.
export function computeForecast(history, currentMonthSpend) {
  if (history.length < 2) return null;
  const base = history.slice(0, -1);
  const avg = base.reduce((s, v) => s + v, 0) / base.length;
  const daysInMonth = 30, dayOfMonth = 19; // demo: 19th of month
  const progressRatio = dayOfMonth / daysInMonth;
  const forecast = progressRatio > 0 && progressRatio < 1
    ? currentMonthSpend / progressRatio
    : avg;
  const pctVsAvg = Math.round(((forecast - avg) / avg) * 100);
  const confidence = base.length >= 5 ? 'High' : base.length >= 3 ? 'Moderate' : 'Low';
  return { forecast, avg, pctVsAvg, confidence, monthsOfData: base.length };
}

// Supplier diversification — HHI-inspired. 100 = perfect spread, low = concentrated.
export function diversificationScore(suppliersData) {
  const totals = suppliersData.map((s) => s.history.reduce((a, b) => a + b, 0));
  const grandTotal = totals.reduce((a, b) => a + b, 0) || 1;
  const shares = totals.map((t) => (t / grandTotal) * 100);
  const hhi = shares.reduce((s, sh) => s + sh * sh, 0);
  const score = Math.round(Math.max(0, Math.min(100, 100 - (hhi - 2000) / 80)));
  const maxShare = Math.max(...shares);
  const topIdx = shares.indexOf(maxShare);
  const topName = suppliersData[topIdx]?.name ?? '—';
  const supplierCount = suppliersData.filter((_, i) => totals[i] > 0).length;
  let status, insight, action;
  if (maxShare >= 40) {
    status = '⚠️ Concentrated';
    insight = `${topName} dominates ${Math.round(maxShare)}% of spend`;
    action = 'You may have negotiation leverage with them — or consider spreading risk';
  } else if (maxShare >= 25) {
    status = '🟠 Moderate spread';
    insight = `${topName} leads at ${Math.round(maxShare)}% of spend`;
    action = 'Reasonable, but one more supplier could reduce dependency';
  } else {
    status = '✅ Healthy spread';
    insight = `Spend spread across ${supplierCount} suppliers`;
    action = 'Healthy purchasing profile — strong negotiating position';
  }
  return { score, hhi: Math.round(hhi), maxShare: Math.round(maxShare), topName, supplierCount, status, insight, action, shares, totals };
}
