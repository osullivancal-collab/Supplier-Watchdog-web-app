// The signed-in store: same shape and same actions as the on-phone store
// (store.js), but every change is written to the database first and only
// shown once the database has accepted it. If the write fails, the screen
// keeps the old value and the person is told why. Nothing pretends to save.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getClient } from './backend.js';
import { derive, emptyState, reducer, savePhoto, toIso } from './store.js';

const nil = (v) => (v === '' || v === undefined ? null : v);
const INTAKE_DOMAIN = import.meta.env.VITE_INTAKE_EMAIL_DOMAIN || '';

// ----- rows ↔ the app's stored shapes -------------------------------------
export const supplierFromRow = (r) => ({
  id: r.id, name: r.name, terms: r.terms || '30 days EOM', rep: r.rep || '', phone: r.phone || '', account: r.account_no || '', branch: r.branch || '', limit: r.credit_limit == null ? null : Number(r.credit_limit),
});
export const supplierToRow = (s, uid) => ({
  id: s.id, user_id: uid, name: String(s.name || '').trim(), terms: nil(s.terms), rep: nil(s.rep), phone: nil(s.phone), account_no: nil(s.account), branch: nil(s.branch),
  credit_limit: s.limit ? Number(s.limit) : null,
});

export const billFromRow = (r) => ({
  id: r.id, supplierId: r.supplier_id, vendor: r.vendor_name || undefined, ref: r.ref || '', total: Number(r.total),
  issued: r.issued_on, due: r.due_on, paid: r.paid_on, job: r.job, photo: Boolean(r.photo_path), photoPath: r.photo_path,
  status: r.status, confidence: r.confidence, flag: null,
});
export const billToRow = (b, uid) => ({
  id: b.id, user_id: uid, supplier_id: nil(b.supplierId), vendor_name: nil(b.vendor), ref: nil(String(b.ref || '').trim()),
  total: b.total, gst: b.gst ?? null, issued_on: b.issued, due_on: b.due, paid_on: b.paid ?? null, job: nil(b.job),
  status: b.status || 'confirmed', source: b.source || (b.photoPath ? 'photo' : 'manual'), confidence: b.confidence ?? null, photo_path: b.photoPath ?? null,
});

export const dealFromRow = (r) => ({
  id: r.id, supplierId: r.supplier_id, kind: r.kind, target: Number(r.target), reward: r.reward, rep: r.rep || '',
  startIso: r.starts_on, endIso: r.ends_on, signatures: { you: r.signature_you, rep: r.signature_rep }, signedAt: r.signed_at,
});
export const dealToRow = (d, uid) => ({
  id: d.id, user_id: uid, supplier_id: d.supplierId, kind: d.kind, target: d.target, reward: d.reward, rep: nil(d.rep),
  starts_on: d.startIso, ends_on: d.endIso, signature_you: d.signatures?.you ?? null, signature_rep: d.signatures?.rep ?? null, signed_at: d.signedAt ?? null,
});

export function businessFromProfile(p, email) {
  const owner = p?.owner_name || '';
  const name = p?.business_name || '';
  const initials = ((owner || name || email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
  return {
    name: name || 'Your business', owner, initials, email: email || '',
    forwardAddress: p?.intake_email_token && INTAKE_DOMAIN ? `${p.intake_email_token}@${INTAKE_DOMAIN}` : '',
  };
}

/** Plain-language message for a failed save. */
export function saveError(error) {
  const msg = String(error?.message || '');
  if (msg.includes('WATCHDOG_READ_ONLY') || error?.code === '42501') return 'Your free trial has ended — subscribe in Account to keep adding and changing bills.';
  if (error?.code === '23505' && /bills/.test(msg + (error?.details || ''))) return 'That invoice number is already in for this supplier.';
  if (error?.code === '23505' && /suppliers/.test(msg + (error?.details || ''))) return 'You already have a supplier with that name.';
  if (error?.code === '23505') return 'That’s already in.';
  if (error?.code === '23514') return 'Something in that doesn’t look right — check the dates and amount.';
  if (/fetch|network|Failed to/i.test(msg)) return 'No connection — nothing was saved. Try again when you have signal.';
  return 'Couldn’t save that. Try again.';
}

const must = ({ data, error }) => { if (error) throw error; return data; };

// ----- loading ------------------------------------------------------------
export async function loadAll(sb, uid, email) {
  const [profile, suppliers, bills, deals, alerts, disputes] = await Promise.all([
    sb.from('profiles').select('owner_name,business_name,intake_email_token').eq('id', uid).maybeSingle().then(must),
    sb.from('suppliers').select('*').order('name').then(must),
    sb.from('bills').select('*').order('issued_on', { ascending: false }).limit(5000).then(must),
    sb.from('deals').select('*').order('created_at', { ascending: false }).then(must),
    sb.from('price_alerts').select('*').then(must),
    sb.from('disputes').select('*').then(must),
  ]);
  const all = bills.map(billFromRow);
  return {
    useSample: false,
    business: businessFromProfile(profile, email),
    suppliers: suppliers.map(supplierFromRow),
    bills: all.filter((b) => b.status !== 'pending'),
    pending: all.filter((b) => b.status === 'pending'),
    deals: deals.map(dealFromRow),
    alerts: Object.fromEntries(alerts.map((a) => [a.item_key, { at: Number(a.at_price), on: a.enabled }])),
    disputes: Object.fromEntries(disputes.map((d) => [d.catch_key, String(d.created_at).slice(0, 10)])),
  };
}

const dataUrlToBlob = async (url) => (await fetch(url)).blob();

// ----- writing: one database write per app action ---------------------------
/** Writes the action, then returns the action to apply on screen (possibly updated). */
export async function writeAction(sb, uid, a, state) {
  switch (a.type) {
    case 'saveBill': {
      let bill = a.bill;
      if (a.photo) {
        const path = `${uid}/${bill.id}.jpg`;
        must(await sb.storage.from('dockets').upload(path, await dataUrlToBlob(a.photo), { contentType: 'image/jpeg', upsert: true }));
        bill = { ...bill, photo: true, photoPath: path };
      } else if (a.photo === null && bill.photoPath) {
        const { error } = await sb.storage.from('dockets').remove([bill.photoPath]);
        if (error) console.error('[remote] old photo not removed', error.message); // harmless leftover; the bill no longer points at it
        bill = { ...bill, photo: false, photoPath: null };
      }
      must(await sb.from('bills').upsert(billToRow(bill, uid)));
      return { ...a, bill, isNew: a.isNew || !state.bills.some((b) => b.id === bill.id) };
    }
    case 'deleteBill': {
      const bill = state.bills.find((b) => b.id === a.id) || state.pending.find((b) => b.id === a.id);
      must(await sb.from('bills').delete().eq('id', a.id));
      if (bill?.photoPath) {
        const { error } = await sb.storage.from('dockets').remove([bill.photoPath]);
        if (error) console.error('[remote] photo not removed', error.message);
      }
      return { ...a, type: 'remoteDelete' };
    }
    case 'pay': {
      const paid = a.on ? toIso(new Date()) : null;
      must(await sb.from('bills').update({ paid_on: paid, updated_at: new Date().toISOString() }).eq('id', a.id));
      return { ...a, type: 'remotePay', paid };
    }
    case 'confirm':
      must(await sb.from('bills').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', a.id));
      return a;
    case 'saveSupplier':
      must(await sb.from('suppliers').upsert(supplierToRow(a.supplier, uid)));
      return { ...a, isNew: true }; // signed-in suppliers all live in state.suppliers
    case 'alert':
      must(await sb.from('price_alerts').upsert({ user_id: uid, item_key: a.itemId, at_price: a.at, enabled: a.on }));
      return a;
    case 'deal':
      must(await sb.from('deals').insert(dealToRow(a.deal, uid)));
      return a;
    case 'dispute':
      must(await sb.from('disputes').upsert({ user_id: uid, catch_key: a.id, outcome: 'sent' }));
      return a;
    case 'profile':
      must(await sb.from('profiles').update({ owner_name: nil(a.business.owner), business_name: nil(a.business.name), updated_at: new Date().toISOString() }).eq('id', uid));
      return a;
    case 'hide':
      return a; // on purpose never saved: the counter-mode hide resets each time
    default:
      throw new Error(`Not available when signed in: ${a.type}`);
  }
}

/** The signed-in reducer: the shared one, plus the two cases that differ. */
export function remoteReducer(state, a) {
  if (a.type === 'remoteDelete') return { ...state, bills: state.bills.filter((b) => b.id !== a.id), pending: state.pending.filter((b) => b.id !== a.id) };
  if (a.type === 'remotePay') return { ...state, bills: state.bills.map((b) => (b.id === a.id ? { ...b, paid: a.paid } : b)) };
  if (a.type === 'saveBill') {
    const has = state.bills.some((b) => b.id === a.bill.id);
    return { ...state, bills: has ? state.bills.map((b) => (b.id === a.bill.id ? a.bill : b)) : [a.bill, ...state.bills] };
  }
  return reducer(state, a);
}

const START = { ...emptyState, useSample: false, alerts: {}, business: { name: '', owner: '', initials: '', forwardAddress: '' } };

/** [data, dispatch, status] where dispatch(action) resolves true only once the database saved it. */
export function useRemoteStore(session, onError) {
  const [state, local] = useReducer(remoteReducer, START);
  const [status, setStatus] = useState('loading');
  const uid = session.user.id;
  const errRef = useRef(onError);
  errRef.current = onError;

  const refresh = useCallback(async (quiet) => {
    try {
      const sb = await getClient();
      local({ type: 'load', state: await loadAll(sb, uid, session.user.email) });
      setStatus('ready');
    } catch (e) {
      console.error('[remote] load failed', e);
      // Keep whatever is on screen; a failed refresh must never look like "no bills".
      if (!quiet) setStatus('error');
    }
  }, [uid, session.user.email]);

  useEffect(() => { refresh(false); }, [refresh]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatch = useCallback(async (a) => {
    try {
      const sb = await getClient();
      const applied = await writeAction(sb, uid, a, stateRef.current);
      if (a.type === 'saveBill' && a.photo) savePhoto(applied.bill.id, a.photo); // quick to show on this phone
      local(applied);
      return true;
    } catch (e) {
      console.error('[remote] save failed', a.type, e);
      errRef.current?.(saveError(e));
      return false;
    }
  }, [uid]);

  const data = useMemo(() => derive(state), [state]);
  return [data, dispatch, status, refresh];
}
