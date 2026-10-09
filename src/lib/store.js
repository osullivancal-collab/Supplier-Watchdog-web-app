// App state: everything the user has done — bills and suppliers they added or
// edited, bills marked paid, alerts, deals signed at the counter. Kept in
// localStorage so it survives a reload and works offline. When the backend
// arrives these actions become API writes; the reducer shape stays the same.
//
// Dates the user enters are stored as real dates (YYYY-MM-DD), never as
// "days from today", so a bill added on Monday is still dated Monday next week.

import { useEffect, useMemo, useReducer } from 'react';
import * as sample from '../data/sample.js';
import { dateFromOffset } from './format.js';
import { dayOffset } from './model.js';

const KEY = 'watchdog.v2';
const PHOTO = 'watchdog.photo.';

export const emptyState = {
  useSample: true,
  confirmed: [],            // review-queue ids the user confirmed
  paid: {},                 // bill id → 'YYYY-MM-DD' paid, or null = marked unpaid again
  bills: [],                // bills the user added
  billEdits: {},            // bill id → changed fields (for sample bills)
  deleted: [],              // bill ids removed
  suppliers: [],            // suppliers the user added
  supplierEdits: {},        // supplier id → changed fields
  alerts: { copper: { at: 65, on: true } },
  deals: [],
  hidden: [],
};

export const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const isoFromOffset = (off) => toIso(dateFromOffset(off));
export function offsetFromIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return dayOffset(new Date(y, m - 1, d));
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyState, ...JSON.parse(raw) } : emptyState;
  } catch {
    return emptyState; // private mode or blocked storage: start fresh, nothing breaks
  }
}

export function reducer(state, a) {
  switch (a.type) {
    case 'confirm': return state.confirmed.includes(a.id) ? state : { ...state, confirmed: [...state.confirmed, a.id] };
    case 'pay': return { ...state, paid: { ...state.paid, [a.id]: a.on ? toIso(new Date()) : null } };
    case 'saveBill': {
      const { bill } = a;
      if (state.bills.some((b) => b.id === bill.id)) return { ...state, bills: state.bills.map((b) => (b.id === bill.id ? bill : b)) };
      if (a.isNew) return { ...state, bills: [bill, ...state.bills] };
      return { ...state, billEdits: { ...state.billEdits, [bill.id]: bill } };
    }
    case 'deleteBill': return { ...state, bills: state.bills.filter((b) => b.id !== a.id), deleted: [...state.deleted, a.id] };
    case 'saveSupplier': {
      const { supplier } = a;
      if (state.suppliers.some((s) => s.id === supplier.id) || a.isNew) {
        const rest = state.suppliers.filter((s) => s.id !== supplier.id);
        return { ...state, suppliers: [...rest, supplier] };
      }
      return { ...state, supplierEdits: { ...state.supplierEdits, [supplier.id]: supplier } };
    }
    case 'alert': return { ...state, alerts: { ...state.alerts, [a.itemId]: { at: a.at, on: a.on } } };
    case 'deal': return { ...state, deals: [a.deal, ...state.deals] };
    case 'hide': return { ...state, hidden: state.hidden.includes(a.id) ? state.hidden.filter((x) => x !== a.id) : [...state.hidden, a.id] };
    case 'useSample': return { ...emptyState, useSample: a.on, alerts: a.on ? emptyState.alerts : {} };
    default: return state;
  }
}

/** Turn a stored user bill (real dates) into the model's shape (day offsets). */
function fromStored(b) {
  return { ...b, issued: offsetFromIso(b.issued), due: offsetFromIso(b.due), paid: b.paid ? offsetFromIso(b.paid) : null, mine: true };
}

/** Turn a bill in model shape back into stored shape (for editing a sample bill). */
export function toStored(b) {
  return { ...b, issued: isoFromOffset(b.issued), due: isoFromOffset(b.due), paid: b.paid == null ? null : isoFromOffset(b.paid) };
}

export function derive(state) {
  const base = state.useSample ? sample : { bills: [], suppliers: [], reviewQueue: [], items: [], deals: [], pastDeals: [], rebate: null };
  const deleted = new Set(state.deleted);

  const suppliers = [
    ...base.suppliers.map((s) => ({ ...s, ...(state.supplierEdits[s.id] || {}) })),
    ...state.suppliers,
  ];

  const confirmed = base.reviewQueue.filter((q) => state.confirmed.includes(q.id));
  const sampleBills = [...base.bills, ...confirmed].map((b) => (state.billEdits[b.id] ? fromStored({ ...toStored(b), ...state.billEdits[b.id] }) : b));
  const bills = [...sampleBills, ...state.bills.map(fromStored)]
    .filter((b) => !deleted.has(b.id))
    .map((b) => (b.id in state.paid ? { ...b, paid: state.paid[b.id] ? offsetFromIso(state.paid[b.id]) : null } : b));

  return {
    useSample: state.useSample,
    business: sample.business,
    suppliers,
    bills,
    queue: base.reviewQueue.filter((q) => !state.confirmed.includes(q.id)),
    items: base.items,
    // Deals signed in the app carry real dates; turn them into day offsets.
    deals: [...state.deals.map((d) => (d.startIso ? { ...d, start: offsetFromIso(d.startIso), end: offsetFromIso(d.endIso) } : d)), ...base.deals],
    pastDeals: base.pastDeals,
    rebate: base.rebate,
    alerts: state.alerts,
    hidden: state.hidden,
    jobs: [...new Set(bills.map((b) => b.job).filter(Boolean))].sort(),
  };
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error('[watchdog] could not save', e); }
  }, [state]);
  const data = useMemo(() => derive(state), [state]);
  return [data, dispatch];
}

export const vendorName = (bill, suppliers) =>
  bill.vendor || suppliers.find((s) => s.id === bill.supplierId)?.name || 'Unknown';

// ----- docket photos: kept apart from the main state so it stays small -----
export function savePhoto(billId, dataUrl) {
  try { localStorage.setItem(PHOTO + billId, dataUrl); return true; }
  catch (e) { console.error('[watchdog] photo not saved', e); return false; }
}
export function loadPhoto(billId) {
  try { return localStorage.getItem(PHOTO + billId); } catch { return null; }
}
export function deletePhoto(billId) {
  try { localStorage.removeItem(PHOTO + billId); } catch { /* nothing to remove */ }
}

/** Shrink a camera photo to ~1000px JPEG so it fits in phone storage. */
export function shrinkPhoto(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
    img.src = url;
  });
}
