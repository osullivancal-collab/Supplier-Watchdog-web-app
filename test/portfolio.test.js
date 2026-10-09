import { describe, expect, it } from 'vitest';
import { basQuarter, concentration, eomCutoff, gstToClaim, jobStats, monthGrid, moneyBack, paymentRecord, symbol, treemap, yearReview } from '../src/lib/portfolio.js';

const TODAY = new Date(2026, 9, 9); // Fri 9 Oct 2026
const bill = (o) => ({ id: Math.random().toString(36).slice(2), supplierId: 'reece', total: 110, issued: -5, due: 25, paid: null, ...o });

describe('GST to claim', () => {
  it('knows the BAS quarter and when it is due', () => {
    expect(basQuarter(TODAY)).toMatchObject({ label: 'Oct–Dec' });
    expect(basQuarter(TODAY).lodge).toEqual(new Date(2027, 1, 28));        // Oct–Dec is due 28 Feb
    expect(basQuarter(new Date(2026, 7, 1)).lodge).toEqual(new Date(2026, 9, 28)); // Jul–Sep due 28 Oct
  });

  it('adds printed GST, estimates the rest, nets off credits, ignores last quarter', () => {
    const out = gstToClaim([
      bill({ total: 1100, gst: 100, issued: -2 }),
      bill({ total: 220, issued: -3 }),                 // estimate 20
      bill({ total: -110, gst: 10, issued: -1 }),       // credit gives 10 back
      bill({ total: 5000, issued: -9 }),                // 30 Sep: last quarter
    ], TODAY);
    expect(out).toMatchObject({ amount: 110, count: 3, estimated: 1, label: 'Oct–Dec' });
  });
});

describe('EOM cut-off', () => {
  it('counts down to month end and says how much more credit the 1st gets', () => {
    const out = eomCutoff([{ name: 'Reece', terms: '30 days EOM' }, { name: 'Rexel', terms: '14 days' }], TODAY);
    expect(out.daysLeft).toBe(22);                  // 31 Oct
    expect(out.suppliers).toEqual(['Reece']);
    expect(out.creditToday).toBe(52);               // 9 Oct → 30 Nov
    expect(out.creditFirst).toBe(60);               // 1 Nov → 31 Dec
    expect(out.extraDays).toBe(8);
  });
});

describe('payment record', () => {
  it('counts on-time payments, the current streak and how late the late ones were', () => {
    const r = paymentRecord([
      bill({ issued: -40, due: -10, paid: -12 }),
      bill({ issued: -50, due: -20, paid: -20 }),
      bill({ issued: -70, due: -40, paid: -34 }),   // 6 days late
      bill({ issued: -5, due: -5, paid: -5 }),      // cash sale: not counted
      bill({ total: -50, issued: -8, due: -8, paid: -8 }), // credit: not counted
      bill({ issued: -40, due: -2 }),               // overdue now
    ]);
    expect(r).toMatchObject({ paidCount: 3, onTimePct: 67, streak: 2, lateCount: 1, avgDaysLate: 6, overdueNow: 1 });
  });
});

describe('money back, concentration, jobs', () => {
  it('totals credits and the ones still unused', () => {
    expect(moneyBack([bill({ total: -142, paid: -60, issued: -64 }), bill({ total: -86.5, issued: -12 }), bill({ total: 500 })]))
      .toMatchObject({ credits: 228.5, count: 2, unused: 86.5, unusedCount: 1 });
  });

  it('calls one dominant supplier concentrated', () => {
    expect(concentration([{ name: 'Reece', spend: 1, share: 60 }, { name: 'B', spend: 1, share: 40 }]).label).toBe('Concentrated');
    expect(concentration(Array.from({ length: 10 }, (_, i) => ({ name: `S${i}`, spend: 1, share: 10 }))).label).toBe('Spread out');
  });

  it('turns jobs into positions with spend, owed and a 12-week line', () => {
    const [j] = jobStats([bill({ job: 'Smith reno', total: 300, issued: -3 }), bill({ job: 'Smith reno', total: 200, issued: -40, paid: -10 }), bill({ total: 999 })]);
    expect(j).toMatchObject({ job: 'Smith reno', spend: 500, owed: 300, count: 2, last: -3, first: -40 });
    expect(j.weeks).toHaveLength(12);
    expect(j.weeks.at(-1)).toBe(300);
  });
});

describe('calendar, heatmap, year, ticker', () => {
  it('lays out the month Monday-first with what is due each day', () => {
    const g = monthGrid([bill({ due: 3, total: 400 }), bill({ due: 3, total: 100 }), bill({ due: 3, total: 50, paid: -1 })], 2026, 9, TODAY);
    expect(g.cells.slice(0, 3)).toEqual([null, null, null]);   // 1 Oct 2026 is a Thursday
    const c12 = g.cells.find((c) => c && c.day === 12);
    expect(c12).toMatchObject({ off: 3, total: 500 });
    expect(c12.due).toHaveLength(2);
    expect(g.cells.length % 7).toBe(0);
  });

  it('fills the box exactly, biggest tile first', () => {
    const rects = treemap([{ id: 'a', value: 50 }, { id: 'b', value: 30 }, { id: 'c', value: 15 }, { id: 'd', value: 5 }], 100, 60);
    const area = rects.reduce((t, r) => t + r.w * r.h, 0);
    expect(area).toBeCloseTo(6000, 6);
    expect(rects[0].id).toBe('a');
    for (const r of rects) { expect(r.x).toBeGreaterThanOrEqual(-1e-9); expect(r.x + r.w).toBeLessThanOrEqual(100 + 1e-9); expect(r.y + r.h).toBeLessThanOrEqual(60 + 1e-9); }
    expect(treemap([], 10, 10)).toEqual([]);
  });

  it('sums up the year', () => {
    const y = yearReview([bill({ total: 1000, issued: -10 }), bill({ total: 3000, issued: -100, ref: 'BIG' }), bill({ supplierId: null, vendor: 'Telstra', total: 200, issued: -20 }), bill({ total: 999, issued: -400 })],
      [{ id: 'reece', name: 'Reece' }], TODAY);
    expect(y).toMatchObject({ spend: 4200, count: 3, top: { name: 'Reece', spend: 4000 }, biggest: { name: 'Reece', total: 3000, ref: 'BIG' }, suppliers: 2 });
    expect(y.busiest.label).toBe('Jul');
  });

  it('makes short ticker symbols', () => {
    expect(symbol('Bunnings Trade')).toBe('BUNNINGS');
    expect(symbol("Middy's")).toBe('MIDDYS');
  });
});
