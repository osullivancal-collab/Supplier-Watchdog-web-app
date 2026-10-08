import { useMemo } from 'react';
import {
  aheadSeries, billShock, monthForecast, monthlySpend, openBills, owedSeries, supplierStats, totalOwed,
} from './model.js';

/** Everything the screens show, derived once per data change. */
export function useInsights(data) {
  return useMemo(() => {
    const { bills, suppliers } = data;
    const history = owedSeries(bills, -365);
    const ahead = aheadSeries(bills, 35);
    const open = openBills(bills);
    const ranked = supplierStats(bills, suppliers);
    const months = monthlySpend(bills, 6);
    const prev = months.slice(0, -1);
    const avgMonth = prev.reduce((t, m) => t + m.total, 0) / (prev.length || 1);
    const byChange = [...ranked].sort((a, b) => b.change - a.change);
    return {
      owed: totalOwed(bills),
      history,
      ahead,
      open,
      shock: billShock(bills),
      ranked,
      total90: ranked.reduce((t, s) => t + s.spend, 0),
      months,
      avgMonth,
      forecast: monthForecast(bills),
      overdue: open.filter((b) => b.due < 0).reduce((t, b) => t + b.total, 0),
      next7: open.filter((b) => b.due <= 6).reduce((t, b) => t + b.total, 0),
      riser: byChange[0],
      faller: byChange[byChange.length - 1],
    };
  }, [data]);
}

export const shockTone = (score) => (score < 40 ? 'down' : score < 60 ? 'text-2' : 'up');
