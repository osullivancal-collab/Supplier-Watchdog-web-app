import { describe, expect, it } from 'vitest';
import { derive, emptyState, isoFromOffset, offsetFromIso, reducer, toIso } from './store.js';

const run = (...actions) => actions.reduce(reducer, emptyState);

describe('store', () => {
  it('dates round-trip between real dates and day offsets', () => {
    expect(offsetFromIso(toIso(new Date()))).toBe(0);
    expect(offsetFromIso(isoFromOffset(-17))).toBe(-17);
  });

  it('adds a bill with real dates and shows it as owed', () => {
    const s = run({ type: 'saveBill', isNew: true, bill: { id: 'u1', supplierId: 'reece', total: 250, issued: isoFromOffset(-2), due: isoFromOffset(12), paid: null, ref: '', job: 'Smith reno' } });
    const b = derive(s).bills.find((x) => x.id === 'u1');
    expect(b).toMatchObject({ issued: -2, due: 12, paid: null, total: 250, mine: true });
    expect(derive(s).jobs).toContain('Smith reno');
  });

  it('marks paid today, and can undo it', () => {
    const paid = run({ type: 'pay', id: 'b1', on: true });
    expect(derive(paid).bills.find((x) => x.id === 'b1').paid).toBe(0);
    const undone = reducer(paid, { type: 'pay', id: 'b1', on: false });
    expect(derive(undone).bills.find((x) => x.id === 'b1').paid).toBeNull();
  });

  it('edits a sample bill without losing it, and deletes bills', () => {
    const before = derive(emptyState).bills.find((x) => x.id === 'b1');
    const s = run({ type: 'saveBill', isNew: false, bill: { ...before, issued: isoFromOffset(before.issued), due: isoFromOffset(before.due), paid: null, total: 99 } });
    expect(derive(s).bills.find((x) => x.id === 'b1').total).toBe(99);
    expect(derive(reducer(s, { type: 'deleteBill', id: 'b1' })).bills.some((x) => x.id === 'b1')).toBe(false);
  });

  it('confirming a bill from email adds it to bills and takes it off the queue', () => {
    const s = run({ type: 'confirm', id: 'q1' });
    expect(derive(s).bills.some((x) => x.id === 'q1')).toBe(true);
    expect(derive(s).queue.some((x) => x.id === 'q1')).toBe(false);
  });

  it('start fresh clears everything; suppliers can be added and edited', () => {
    let s = run({ type: 'useSample', on: false });
    expect(derive(s).bills).toHaveLength(0);
    expect(derive(s).suppliers).toHaveLength(0);
    s = reducer(s, { type: 'saveSupplier', isNew: true, supplier: { id: 's1', name: 'Middys Oakleigh', terms: 'EOM' } });
    s = reducer(s, { type: 'saveSupplier', isNew: false, supplier: { id: 's1', name: 'Middys Oakleigh', terms: '14 days' } });
    expect(derive(s).suppliers).toEqual([{ id: 's1', name: 'Middys Oakleigh', terms: '14 days' }]);
  });

  it('deals signed in the app keep real dates', () => {
    const s = run({ type: 'deal', deal: { id: 'd9', supplierId: 'reece', kind: 'share', target: 50, startIso: isoFromOffset(-3), endIso: isoFromOffset(20) } });
    expect(derive(s).deals[0]).toMatchObject({ start: -3, end: 20 });
  });
});
