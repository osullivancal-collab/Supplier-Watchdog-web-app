// App state: what the user has done on top of the sample data (confirmed a
// bill, marked one paid, set an alert, signed a deal). Kept in localStorage so
// it survives a reload. When the real backend arrives these actions become
// API writes; the reducer shape stays the same.

import { useEffect, useMemo, useReducer } from 'react';
import * as sample from '../data/sample.js';

const KEY = 'watchdog.sample.v1';
const empty = { confirmed: [], paid: [], alerts: { copper: { at: 65, on: true } }, deals: [], hidden: [] };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty; // private mode / blocked storage: start fresh, nothing breaks
  }
}

function reducer(state, a) {
  switch (a.type) {
    case 'confirm': return state.confirmed.includes(a.id) ? state : { ...state, confirmed: [...state.confirmed, a.id] };
    case 'pay': return state.paid.includes(a.id) ? state : { ...state, paid: [...state.paid, a.id] };
    case 'alert': return { ...state, alerts: { ...state.alerts, [a.itemId]: { at: a.at, on: a.on } } };
    case 'deal': return { ...state, deals: [a.deal, ...state.deals] };
    case 'hide': return { ...state, hidden: state.hidden.includes(a.id) ? state.hidden.filter((x) => x !== a.id) : [...state.hidden, a.id] };
    case 'reset': return empty;
    default: return state;
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error('[watchdog] could not save state', e); }
  }, [state]);

  const data = useMemo(() => {
    const paid = new Set(state.paid);
    const confirmed = sample.reviewQueue.filter((q) => state.confirmed.includes(q.id));
    const bills = [...sample.bills, ...confirmed].map((b) => (paid.has(b.id) && b.paid == null ? { ...b, paid: 0 } : b));
    return {
      business: sample.business,
      suppliers: sample.suppliers,
      bills,
      queue: sample.reviewQueue.filter((q) => !state.confirmed.includes(q.id)),
      items: sample.items,
      deals: [...state.deals, ...sample.deals],
      pastDeals: sample.pastDeals,
      rebate: sample.rebate,
      alerts: state.alerts,
      hidden: state.hidden,
    };
  }, [state]);

  return [data, dispatch];
}

export const vendorName = (bill, suppliers) =>
  bill.vendor || suppliers.find((s) => s.id === bill.supplierId)?.name || 'Unknown';
