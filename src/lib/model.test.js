import { describe, expect, it } from 'vitest';
import {
  aheadSeries, basketIndex, billShock, catches, dealProgress, dayOffset, dueFromTerms, findDuplicates, monthlySpend, previewPurchase, rollingSpend, spendBuckets,
  overpay, owedSeries, supplierStats, totalOwed,
} from './model.js';

const bill = (o) => ({ id: Math.random().toString(36), supplierId: 'a', ref: 'X', paid: null, ...o });

describe('owed balance', () => {
  it('counts a bill from the day it is issued until the day it is paid', () => {
    const bills = [bill({ total: 100, issued: -5, due: -1, paid: -2 })];
    const s = owedSeries(bills, -6);
    expect(s.map((d) => d.owed)).toEqual([0, 100, 100, 100, 0, 0, 0]);
    expect(s[1].ins).toHaveLength(1);
    expect(s[4].outs).toHaveLength(1);
  });

  it('keeps an unpaid bill owed through today', () => {
    const s = owedSeries([bill({ total: 50, issued: -2, due: 10 })], -3);
    expect(s.at(-1).owed).toBe(50);
  });

  it('totalOwed ignores paid bills', () => {
    expect(totalOwed([bill({ total: 10, issued: -1, due: 5 }), bill({ total: 99, issued: -9, due: -3, paid: -3 })])).toBe(10);
  });
});

describe('cash going out ahead', () => {
  it('steps down on each due date and sends overdue bills out tomorrow', () => {
    const bills = [
      bill({ total: 30, issued: -40, due: -5 }),
      bill({ total: 20, issued: -10, due: 3 }),
      bill({ total: 999, issued: -50, due: -20, paid: -20 }),
    ];
    const a = aheadSeries(bills, 4);
    expect(a.map((d) => d.owed)).toEqual([50, 20, 20, 0, 0]);
    expect(a[3].due).toHaveLength(1);
  });
});

describe('bill shock', () => {
  it('scores 50 when the next 30 days match a normal 30 days', () => {
    // 600 fell due over the last 180 days → normal 100 per 30 days.
    const past = [bill({ total: 600, issued: -120, due: -90, paid: -90 })];
    const next = [bill({ total: 100, issued: -5, due: 10 })];
    const s = billShock([...past, ...next]);
    expect(s.normal).toBe(100);
    expect(s.score).toBe(50);
    expect(s.label).toBe('Normal');
  });

  it('rises when more than usual is coming and caps at 100', () => {
    const past = [bill({ total: 600, issued: -120, due: -90, paid: -90 })];
    expect(billShock([...past, bill({ total: 150, issued: -5, due: 10 })]).score).toBe(85);
    expect(billShock([...past, bill({ total: 150, issued: -5, due: 10 })]).label).toBe('Critical');
    expect(billShock([...past, bill({ total: 10000, issued: -5, due: 10 })]).score).toBe(100);
  });

  it('ignores bills due beyond 30 days', () => {
    const past = [bill({ total: 600, issued: -120, due: -90, paid: -90 })];
    expect(billShock([...past, bill({ total: 5000, issued: -1, due: 45 })]).next30).toBe(0);
  });
});

describe('suppliers', () => {
  it('ranks by 90-day spend and works out share and change', () => {
    const bills = [
      bill({ supplierId: 'a', total: 300, issued: -10, due: 20 }),
      bill({ supplierId: 'b', total: 100, issued: -20, due: 10 }),
      bill({ supplierId: 'a', total: 200, issued: -120, due: -90, paid: -90 }),
    ];
    const [first, second] = supplierStats(bills, [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }]);
    expect(first.id).toBe('a');
    expect(first.share).toBe(75);
    expect(first.change).toBe(50);
    expect(second.rank).toBe(2);
  });
});

describe('deals', () => {
  it('tracks a share deal from bills inside the window only', () => {
    const bills = [
      bill({ supplierId: 'a', total: 300, issued: -3, due: 20 }),
      bill({ supplierId: 'b', total: 100, issued: -2, due: 20 }),
      bill({ supplierId: 'a', total: 9999, issued: -30, due: -1, paid: -1 }),
    ];
    const p = dealProgress({ supplierId: 'a', kind: 'share', target: 50, start: -5, end: 10 }, bills);
    expect(p.value).toBe(75);
    expect(p.pct).toBe(100);
    expect(p.daysLeft).toBe(10);
  });

  it('tracks a spend deal', () => {
    const p = dealProgress({ supplierId: 'a', kind: 'spend', target: 1000, start: -5, end: 3 }, [bill({ supplierId: 'a', total: 250, issued: -1, due: 9 })]);
    expect(p.value).toBe(250);
    expect(p.pct).toBe(25);
  });
});

describe('prices', () => {
  const items = [
    { id: 'x', qtyPerQuarter: 10, history: [100, 110], latest: { a: 110, b: 100 } },
    { id: 'y', qtyPerQuarter: 10, history: [10, 10], latest: { a: 10 } },
  ];
  it('sums what you paid over your own best price', () => {
    const o = overpay(items, 'a');
    expect(o.total).toBe(100);
    expect(o.lines[0].bestId).toBe('b');
  });
  it('basket index weights by quantity', () => {
    expect(basketIndex(items)).toBeCloseTo((1100 + 100) / (1000 + 100) * 100);
  });
});

describe('calendar', () => {
  it('dayOffset is whole days and survives daylight saving', () => {
    const today = new Date(2026, 9, 8);
    expect(dayOffset(new Date(2026, 9, 1), today)).toBe(-7);
    expect(dayOffset(new Date(2026, 3, 1), today)).toBe(-190);
  });
  it('monthlySpend buckets by issue month', () => {
    const today = new Date(2026, 9, 8);
    const rows = monthlySpend([bill({ total: 5, issued: -3, due: 1 }), bill({ total: 7, issued: -10, due: 1 })], 2, today);
    expect(rows.map((r) => r.total)).toEqual([7, 5]);
    expect(rows[1].current).toBe(true);
  });
});

describe('payment terms', () => {
  const today = new Date(2026, 9, 9); // Fri 9 Oct 2026
  it('works out due dates the way wholesalers bill', () => {
    expect(dueFromTerms(0, 'COD', today)).toBe(0);
    expect(dueFromTerms(0, '14 days', today)).toBe(14);
    expect(dueFromTerms(0, 'EOM', today)).toBe(22);          // 31 Oct
    expect(dueFromTerms(0, '30 days EOM', today)).toBe(52);  // 30 Nov
    expect(dueFromTerms(-15, '30 days EOM', today)).toBe(22); // dated 24 Sep → due 31 Oct
  });
});

describe('supplier sparkline', () => {
  it('is spend in the 30 days up to each day, stepping when bills come and go', () => {
    const bills = [bill({ supplierId: 'a', total: 100, issued: -40, due: 0 }), bill({ supplierId: 'a', total: 50, issued: -5, due: 20 }), bill({ supplierId: 'b', total: 999, issued: -5, due: 20 })];
    const s = rollingSpend(bills, 'a', 45);
    expect(s).toHaveLength(46);
    expect(s[0]).toBe(0);                 // day -45
    expect(s[45 - 40]).toBe(100);         // day -40: bill arrives
    expect(s[45 - 11]).toBe(100);         // day -11: still inside its 30 days
    expect(s[45 - 10]).toBe(0);           // day -10: it has dropped out
    expect(s.at(-1)).toBe(50);            // today
  });
  it('never goes negative because of bills dated before the chart starts', () => {
    const bills = [bill({ supplierId: 'a', total: 100, issued: -80, due: 0 }), bill({ supplierId: 'a', total: 40, issued: -3, due: 9 })];
    const s = rollingSpend(bills, 'a', 45);
    expect(Math.min(...s)).toBe(0);
    expect(s.at(-1)).toBe(40);
  });
});

describe('try a buy', () => {
  it('shows when you would pay and what it does to bill shock', () => {
    const past = [bill({ total: 600, issued: -120, due: -90, paid: -90 })];
    const p = previewPurchase(past, { supplierId: 'a', amount: 100, terms: '14 days' }, new Date(2026, 9, 9));
    expect(p.due).toBe(14);
    expect(p.owedAfter - p.owedBefore).toBe(100);
    expect(p.after.score).toBeGreaterThan(p.before.score);
  });
  it('a cash purchase is paid on the spot and owes nothing', () => {
    const p = previewPurchase([], { supplierId: 'a', amount: 100, terms: 'COD' });
    expect(p.owedAfter).toBe(0);
  });
});

describe('dot chart buckets', () => {
  const today = new Date(2026, 9, 9);
  const bills = [
    bill({ supplierId: 'a', total: 100, issued: 0, due: 3 }),
    bill({ supplierId: 'b', total: 50, issued: -1, due: 9, paid: -1 }),
    bill({ supplierId: 'a', total: 70, issued: -40, due: -5 }),          // overdue → goes out tomorrow
  ];
  it('one dot per day on 1M, with what is due ahead', () => {
    const r = spendBuckets(bills, '1M', { today });
    expect(r.unit).toBe('day');
    expect(r.past).toHaveLength(30);
    expect(r.past.at(-1)).toMatchObject({ total: 100, count: 1, top: 'a' });
    expect(r.ahead[0].total).toBe(70);   // tomorrow: the overdue bill
    expect(r.ahead[2].total).toBe(100);  // day 3
  });
  it('one dot per week on 3M and 6M, per month on 1Y', () => {
    expect(spendBuckets(bills, '3M', { today }).past).toHaveLength(13);
    expect(spendBuckets(bills, '6M', { today }).past).toHaveLength(26);
    const y = spendBuckets(bills, '1Y', { today });
    expect(y.unit).toBe('month');
    expect(y.past).toHaveLength(12);
    expect(y.past.at(-1).total).toBe(150);   // October so far
    expect(y.ahead).toHaveLength(2);
  });
  it('can be narrowed to one supplier', () => {
    expect(spendBuckets(bills, '1M', { today, supplierId: 'b' }).past.at(-2).total).toBe(50);
  });
});

describe('caught money', () => {
  it('flags the same supplier billing the same amount twice in a week', () => {
    const d = findDuplicates([
      bill({ supplierId: 'a', total: 2310, issued: -3, due: 20, ref: 'TL-1' }),
      bill({ supplierId: 'a', total: 2310, issued: 0, due: 22, ref: 'TL-2' }),
      bill({ supplierId: 'a', total: 2310, issued: -30, due: 0, ref: 'TL-0' }),
      bill({ supplierId: 'b', total: 2310, issued: 0, due: 22, ref: 'X' }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].a.ref).toBe('TL-1');
  });
  it('turns price gaps into dollar catches, biggest first', () => {
    const items = [{ id: 'x', name: 'Cable', qtyPerQuarter: 10, history: [100, 110], latest: { a: 110, b: 100 } }];
    const c = catches({ bills: [], items, suppliers: [{ id: 'a' }, { id: 'b' }] });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'price', supplierId: 'a', amount: 100 });
  });
});
