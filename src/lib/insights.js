import { useMemo } from 'react';
import {
  aheadSeries, billShock, monthForecast, monthlySpend, openBills, owedSeries, rollingSpend, supplierPosition,
  supplierStats, totalOwed,
} from './model.js';
import { concentration, creditUse, eomCutoff, gstToClaim, jobStats, moneyBack, paymentRecord, yearReview } from './portfolio.js';

/** Everything the screens show, derived once per data change. */
export function useInsights(data) {
  return useMemo(() => insights(data), [data]);
}

export function insights({ bills, suppliers }) {
  const history = owedSeries(bills, -365);
  const open = openBills(bills);
  const ranked = supplierStats(bills, suppliers).map((s) => ({
    ...s,
    spark: rollingSpend(bills, s.id, 90),
    ...supplierPosition(bills, s.id),
  }));
  const months = monthlySpend(bills, 6);
  const prev = months.slice(0, -1);
  const avgMonth = prev.reduce((t, m) => t + m.total, 0) / (prev.length || 1);
  const active = ranked.filter((s) => s.spend > 0);
  const byChange = [...active].sort((a, b) => b.change - a.change);
  const shock = billShock(bills);
  return {
    empty: bills.length === 0,
    owed: totalOwed(bills),
    history,
    ahead: aheadSeries(bills, 35),
    open,
    shock,
    // The whole app leans warm when bills are piling up, cool when they're not.
    mood: shock.score >= 60 ? 'hot' : 'cool',
    ranked,
    total90: ranked.reduce((t, s) => t + s.spend, 0),
    months,
    avgMonth,
    forecast: monthForecast(bills),
    overdue: open.filter((b) => b.total > 0 && b.due < 0).reduce((t, b) => t + b.total, 0),
    next7: open.filter((b) => b.total > 0 && b.due <= 6).reduce((t, b) => t + b.total, 0),
    riser: byChange[0] && byChange[0].change > 0 ? byChange[0] : null,
    // Portfolio numbers (portfolio.js), all from bills alone.
    billCount: bills.length,
    gst: gstToClaim(bills),
    eom: eomCutoff(suppliers),
    record: paymentRecord(bills),
    back: moneyBack(bills),
    spread: concentration(ranked),
    jobs: jobStats(bills),
    year: yearReview(bills, suppliers),
    // Accounts with a credit limit set, closest to the limit first.
    credit: suppliers.map((s) => creditUse(bills, s)).filter(Boolean).sort((a, b) => b.usedPct - a.usedPct),
    faller: byChange.length > 1 && byChange.at(-1).change < 0 ? byChange.at(-1) : null,
  };
}

export const shockTone = (score) => (score < 40 ? 'down' : score < 60 ? 'text' : 'up');
