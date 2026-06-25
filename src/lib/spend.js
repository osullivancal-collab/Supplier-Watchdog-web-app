// Period slicing for the spend charts.
// Given full monthly arrays, return the slice matching a period toggle.
// (Mock months run Nov→Jun = 8 months. Real version filters by date in SQL.)

const PERIOD_MONTHS = { '1M': 1, '3M': 3, '6M': 6, 'YTD': 6, 'All': 99 };

export function sliceSpend(values, labels, period) {
  const n = PERIOD_MONTHS[period] ?? values.length;
  const start = Math.max(0, values.length - n);
  return { values: values.slice(start), labels: labels.slice(start) };
}

// Percentage change: latest period vs the one before it.
export function periodChange(values) {
  if (values.length < 2) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  if (prev === 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}
