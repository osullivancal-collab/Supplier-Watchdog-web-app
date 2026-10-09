import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './components/Icon.jsx';
import { EomSheet, GstSheet, YearSheet } from './components/Portfolio.jsx';
import { catches as findCatches } from './lib/model.js';
import { Sheet, ToastProvider, useToast } from './components/UI.jsx';
import { money } from './lib/format.js';
import { useInsights } from './lib/insights.js';
import { backendEnabled, signOut, useAccess, useSession } from './lib/backend.js';
import { useRemoteStore } from './lib/remote.js';
import { deletePhoto, newId, savePhoto, useStore, vendorName } from './lib/store.js';
import Bills from './screens/Bills.jsx';
import Counter from './screens/Counter.jsx';
import Deals, { TenderSheet } from './screens/Deals.jsx';
import Home, { CaughtList } from './screens/Home.jsx';
import SignIn from './screens/SignIn.jsx';
import { AccountSheet, AddMenu, BillForm, BillSheet, DisputeSheet, ItemSheet, SupplierForm, TryBuy } from './screens/Sheets.jsx';
import Supplier from './screens/Supplier.jsx';
import Suppliers from './screens/Suppliers.jsx';

const TABS = [['home', 'Home'], ['bills', 'Bills'], ['add', ''], ['suppliers', 'Market'], ['deals', 'Deals']];

export default function App() {
  return <ToastProvider><Root /></ToastProvider>;
}

const LOCAL = 'watchdog.mode';
const readMode = () => { try { return localStorage.getItem(LOCAL); } catch { return null; } };

/**
 * Without backend keys the app is on-phone only, as before. With them, people
 * sign in (or choose to just look around with sample data on this phone).
 */
function Root() {
  const session = useSession();
  const [mode, setMode] = useState(readMode);
  const setLocal = (on) => { try { on ? localStorage.setItem(LOCAL, 'local') : localStorage.removeItem(LOCAL); } catch { /* fine */ } setMode(on ? 'local' : null); };

  if (!backendEnabled) return <LocalShell />;
  if (session === undefined) return <Splash />;
  if (session) return <RemoteShell key={session.user.id} session={session} />;
  if (mode === 'local') return <LocalShell onSignIn={() => setLocal(false)} />;
  return <SignIn onLookAround={() => setLocal(true)} />;
}

function Splash({ children }) {
  return (
    <div className="app"><main className="scroll"><div className="page" style={{ paddingTop: 120, alignItems: 'center', textAlign: 'center', gap: 16 }}>
      <span className="brand-mark" style={{ width: 52, height: 52 }}><Icon name="eye" size={26} stroke={2.2} /></span>
      {children || <p className="muted" role="status">Loading…</p>}
    </div></main></div>
  );
}

function LocalShell({ onSignIn }) {
  const [data, dispatch] = useStore();
  return <Shell data={data} dispatch={dispatch} onSignIn={onSignIn} />;
}

function RemoteShell({ session }) {
  const toast = useToast();
  const [data, dispatch, status, refresh] = useRemoteStore(session, toast);
  const [access, refreshAccess] = useAccess(session);

  // Coming back from Stripe Checkout.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('checkout');
    if (!q) return;
    history.replaceState(history.state, '', window.location.pathname);
    if (q === 'success') { toast('You’re subscribed — thanks!'); refreshAccess(); }
  }, [toast, refreshAccess]);

  if (status === 'loading') return <Splash />;
  if (status === 'error') {
    return <Splash><p className="muted">Couldn’t load your bills. Check your connection.</p>
      <button className="btn btn-primary" onClick={() => refresh(false)}>Try again</button></Splash>;
  }
  const account = { email: session.user.email, access, refreshAccess, signOut: async () => { await signOut(); } };
  return <Shell data={data} dispatch={dispatch} account={account} />;
}

/**
 * Overlays (supplier page, sheets, counter mode) sit on a stack mirrored into
 * browser history, so the phone's back gesture closes the top one instead of
 * leaving the app. `replace` swaps the top overlay (e.g. + menu → bill form).
 */
function useOverlays() {
  const [stack, setStack] = useState([]);
  const depth = useRef(0);
  useEffect(() => {
    // history.go(-n) fires one popstate, so read the depth we landed on.
    const onPop = () => { depth.current = history.state?.overlay || 0; setStack((s) => s.slice(0, depth.current)); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const open = useCallback((o) => { depth.current += 1; history.pushState({ overlay: depth.current }, ''); setStack((s) => [...s, o]); }, []);
  const replace = useCallback((o) => { setStack((s) => (s.length ? [...s.slice(0, -1), o] : [o])); if (!depth.current) { depth.current = 1; history.pushState({ overlay: 1 }, ''); } }, []);
  const close = useCallback(() => { if (depth.current > 0) history.back(); }, []);
  const closeAll = useCallback(() => { if (depth.current > 0) history.go(-depth.current); }, []);
  return { stack, open, replace, close, closeAll };
}

/** Light by default (readable in sun); dark or "match phone" on request. Kept on this phone. */
function useTheme() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('watchdog.theme') || 'light'; } catch { return 'light'; } });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1317' : '#ECEDE8');
    try { localStorage.setItem('watchdog.theme', theme); } catch { /* fine: falls back to light next time */ }
  }, [theme]);
  return [theme, setTheme];
}

function Shell({ data, dispatch, account = null, onSignIn = null }) {
  const [theme, setTheme] = useTheme();
  const ins = useInsights(data);
  const toast = useToast();
  const [tab, setTab] = useState('home');
  const [jobFilter, setJobFilter] = useState(null);
  const scroller = useRef(null);
  const { stack, open, replace, close, closeAll } = useOverlays();
  const name = (b) => vendorName(b, data.suppliers);
  const top = stack.at(-1);
  // Sheets opened from the + menu replace it rather than stacking on top.
  const fromMenu = (o) => (top?.type === 'menu' ? replace(o) : open(o));

  const go = {
    tab: (t) => { closeAll(); setJobFilter(null); setTab(t); scroller.current?.scrollTo(0, 0); },
    supplier: (id) => open({ type: 'supplier', id }),
    bill: (id, pending) => open({ type: 'bill', id, pending }),
    item: (id) => open({ type: 'item', id }),
    counter: (supplierId) => fromMenu({ type: 'counter', supplierId }),
    tender: () => open({ type: 'tender' }),
    dispute: (c) => open({ type: 'dispute', c }),
    caught: () => open({ type: 'caught' }),
    gst: () => open({ type: 'gst' }),
    eom: () => open({ type: 'eom' }),
    year: () => open({ type: 'year' }),
    job: (j) => { setJobFilter(j); closeAll(); setTab('bills'); scroller.current?.scrollTo(0, 0); },
    account: () => open({ type: 'account' }),
    addBill: (supplierId, extra = {}) => fromMenu({ type: 'billForm', preset: { supplierId, ...extra } }),
    editBill: (id) => replace({ type: 'billForm', id }),
    addSupplier: () => fromMenu({ type: 'supplierForm' }),
    editSupplier: (id) => open({ type: 'supplierForm', id }),
    tryPurchase: () => fromMenu({ type: 'tryBuy' }),
    confirm: async (q) => {
      if (!(await dispatch({ type: 'confirm', id: q.id }))) return false;
      try { navigator.vibrate?.(10); } catch { /* not supported */ }
      toast(`${name(q)} ${money(q.total)} added`);
      return true;
    },
  };

  const newSupplier = async (supplierName) => {
    const id = newId();
    const ok = await dispatch({ type: 'saveSupplier', supplier: { id, name: supplierName, terms: '30 days EOM' }, isNew: true });
    return ok ? id : null;
  };

  // photo: a new photo (data URL), null = removed, undefined = unchanged.
  const saveBill = async (stored, isNew, photo) => {
    let note = null;
    if (!data.remote) {
      if (photo) { if (!savePhoto(stored.id, photo)) { stored = { ...stored, photo: false }; note = 'Bill saved — photo too big to keep on this phone'; } }
      else if (photo === null) deletePhoto(stored.id);
    }
    if (!(await dispatch({ type: 'saveBill', bill: stored, isNew, photo }))) return;
    close();
    toast(note || (isNew ? `${name(stored)} ${money(stored.total)} added` : 'Bill updated'));
  };

  const renderOverlay = (o, i) => {
    const key = `${o.type}-${i}`;
    switch (o.type) {
      case 'menu': return <AddMenu key={key} onClose={close} go={go} />;
      case 'gst': return <GstSheet key={key} gst={ins.gst} onClose={close} />;
      case 'eom': return <EomSheet key={key} eom={ins.eom} onClose={close} />;
      case 'year': return <YearSheet key={key} year={ins.year} record={ins.record} back={ins.back} caught={findCatches(data).filter((c) => !data.disputes[c.id]).reduce((t, c) => t + c.amount, 0)} onClose={close} />;
      case 'caught': return (
        <Sheet key={key} title="Watchdog caught" onClose={close}>
          <p className="muted" style={{ marginTop: -6 }}>Places you've been charged more than you need to be. Dispute one and Watchdog writes the message.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><CaughtList data={data} onDispute={go.dispute} /></div>
        </Sheet>
      );
      case 'supplier': return <Supplier key={key} data={data} ins={ins} supplierId={o.id} go={go} onClose={close} />;
      case 'item': return <ItemSheet key={key} data={data} itemId={o.id} onClose={close}
        onAlert={async (it, at, on) => { if (!(await dispatch({ type: 'alert', itemId: it.id, at, on }))) return; toast(on ? `Alert set at ${money(at)}` : 'Alert off'); close(); }} />;
      case 'tender': return <TenderSheet key={key} data={data} ins={ins} onClose={close} onSend={() => { toast('Saved — sending goes live with email'); close(); }} />;
      case 'dispute': return <DisputeSheet key={key} data={data} c={o.c} onClose={close}
        onSent={async () => { if (!(await dispatch({ type: 'dispute', id: o.c.id }))) return; toast('Marked as sent — Watchdog keeps an eye on the next bill'); close(); }} />;
      case 'account': return <AccountSheet key={key} data={data} onClose={close} theme={theme} onTheme={setTheme}
        account={account} onSignIn={onSignIn} onProfile={async (business) => { if (await dispatch({ type: 'profile', business })) toast('Saved'); }}
        onUseSample={(on) => { dispatch({ type: 'useSample', on }); closeAll(); setTab('home'); toast(on ? 'Sample data back on' : 'Fresh start — add your first bill with +'); }} />;
      case 'counter': return <Counter key={key} data={data} ins={ins} presetSupplier={o.supplierId} onClose={close}
        onHide={(id) => dispatch({ type: 'hide', id })} onLock={async (deal) => { const ok = await dispatch({ type: 'deal', deal }); if (ok) toast('Deal locked in'); return ok; }} />;
      case 'tryBuy': return <TryBuy key={key} data={data} onClose={close}
        onAdd={({ supplierId, amount }) => replace({ type: 'billForm', preset: { supplierId, amount } })} />;
      case 'supplierForm': {
        const supplier = o.id ? data.suppliers.find((s) => s.id === o.id) : null;
        return <SupplierForm key={key} data={data} supplier={supplier} onClose={close}
          onSave={async (s, isNew) => { if (!(await dispatch({ type: 'saveSupplier', supplier: s, isNew }))) return; close(); toast(isNew ? `${s.name} added` : 'Saved'); }} />;
      }
      case 'billForm': {
        const bill = o.id ? data.bills.find((b) => b.id === o.id) : null;
        return <BillForm key={key} data={data} bill={bill} preset={o.preset} onClose={close} onSave={saveBill} onNewSupplier={newSupplier} canRead={Boolean(account?.access?.has_access)} />;
      }
      case 'bill': {
        const bill = o.pending || data.bills.find((b) => b.id === o.id);
        if (!bill) return null;
        const pending = o.pending && data.queue.some((q) => q.id === o.pending.id) ? o.pending : null;
        return <BillSheet key={key} data={data} bill={bill} pending={pending} onClose={close}
          onConfirm={async () => { if (await go.confirm(bill)) close(); }}
          onPay={async () => { const on = bill.paid == null; if (!(await dispatch({ type: 'pay', id: bill.id, on }))) return; toast(on ? `${name(bill)} ${money(bill.total)} paid` : 'Marked as not paid'); close(); }}
          onEdit={() => go.editBill(bill.id)}
          onDelete={async () => { if (!(await dispatch({ type: 'deleteBill', id: bill.id }))) return; deletePhoto(bill.id); toast('Bill deleted'); close(); }} />;
      }
      default: return null;
    }
  };

  return (
    <div className="app">
      <main className="scroll" ref={scroller}>
        {tab === 'home' && <Home data={data} ins={ins} go={go} account={account} />}
        {tab === 'bills' && <Bills key={jobFilter || 'all'} data={data} ins={ins} go={go} initialJob={jobFilter} />}
        {tab === 'suppliers' && <Suppliers data={data} ins={ins} go={go} />}
        {tab === 'deals' && <Deals data={data} ins={ins} go={go} />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(([k, label]) => k === 'add' ? (
          <button key={k} className="tab-add" aria-label="Add something" onClick={() => (top?.type === 'menu' ? close() : open({ type: 'menu' }))}>
            <Icon name="plus" size={28} stroke={2.6} />
          </button>
        ) : (
          <button key={k} className="tab" aria-current={tab === k && !stack.length ? 'page' : undefined} onClick={() => go.tab(k)}>
            <Icon name={k} size={24} />
            {label}
            {k === 'bills' && data.queue.length > 0 && <span className="badge num" aria-label={`${data.queue.length} new`}>{data.queue.length}</span>}
          </button>
        ))}
      </nav>

      {stack.map(renderOverlay)}
    </div>
  );
}

