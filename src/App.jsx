import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './components/Icon.jsx';
import { ToastProvider, useToast } from './components/UI.jsx';
import { money } from './lib/format.js';
import { useInsights } from './lib/insights.js';
import { deletePhoto, savePhoto, useStore, vendorName } from './lib/store.js';
import Bills from './screens/Bills.jsx';
import Counter from './screens/Counter.jsx';
import Deals, { TenderSheet } from './screens/Deals.jsx';
import Home from './screens/Home.jsx';
import { AccountSheet, AddMenu, BillForm, BillSheet, DisputeSheet, ItemSheet, SupplierForm, TryBuy } from './screens/Sheets.jsx';
import Supplier from './screens/Supplier.jsx';
import Suppliers from './screens/Suppliers.jsx';

const TABS = [['home', 'Home'], ['bills', 'Bills'], ['add', ''], ['suppliers', 'Suppliers'], ['deals', 'Deals']];

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>;
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

function Shell() {
  const [data, dispatch] = useStore();
  const [theme, setTheme] = useTheme();
  const ins = useInsights(data);
  const toast = useToast();
  const [tab, setTab] = useState('home');
  const scroller = useRef(null);
  const { stack, open, replace, close, closeAll } = useOverlays();
  const name = (b) => vendorName(b, data.suppliers);
  const top = stack.at(-1);
  // Sheets opened from the + menu replace it rather than stacking on top.
  const fromMenu = (o) => (top?.type === 'menu' ? replace(o) : open(o));

  const go = {
    tab: (t) => { closeAll(); setTab(t); scroller.current?.scrollTo(0, 0); },
    supplier: (id) => open({ type: 'supplier', id }),
    bill: (id, pending) => open({ type: 'bill', id, pending }),
    item: (id) => open({ type: 'item', id }),
    counter: (supplierId) => fromMenu({ type: 'counter', supplierId }),
    tender: () => open({ type: 'tender' }),
    dispute: (c) => open({ type: 'dispute', c }),
    account: () => open({ type: 'account' }),
    addBill: (supplierId, extra = {}) => fromMenu({ type: 'billForm', preset: { supplierId, ...extra } }),
    editBill: (id) => replace({ type: 'billForm', id }),
    addSupplier: () => fromMenu({ type: 'supplierForm' }),
    editSupplier: (id) => open({ type: 'supplierForm', id }),
    tryPurchase: () => fromMenu({ type: 'tryBuy' }),
    confirm: (q) => {
      dispatch({ type: 'confirm', id: q.id });
      try { navigator.vibrate?.(10); } catch { /* not supported */ }
      toast(`${name(q)} ${money(q.total)} added`);
    },
  };

  const newSupplier = (supplierName) => {
    const id = `s${Date.now()}`;
    dispatch({ type: 'saveSupplier', supplier: { id, name: supplierName, terms: '30 days EOM' }, isNew: true });
    return id;
  };

  const saveBill = (stored, isNew, photo) => {
    if (photo) {
      if (!savePhoto(stored.id, photo)) { stored = { ...stored, photo: false }; toast('Bill saved — photo too big to keep on this phone'); }
    } else deletePhoto(stored.id);
    dispatch({ type: 'saveBill', bill: stored, isNew });
    close();
    if (!(photo && !stored.photo)) toast(isNew ? `${name(stored)} ${money(stored.total)} added` : 'Bill updated');
  };

  const renderOverlay = (o, i) => {
    const key = `${o.type}-${i}`;
    switch (o.type) {
      case 'menu': return <AddMenu key={key} onClose={close} go={go} />;
      case 'supplier': return <Supplier key={key} data={data} ins={ins} supplierId={o.id} go={go} onClose={close} />;
      case 'item': return <ItemSheet key={key} data={data} itemId={o.id} onClose={close}
        onAlert={(it, at, on) => { dispatch({ type: 'alert', itemId: it.id, at, on }); toast(on ? `Alert set at ${money(at)}` : 'Alert off'); close(); }} />;
      case 'tender': return <TenderSheet key={key} data={data} ins={ins} onClose={close} onSend={() => { toast('Saved — sending goes live with email'); close(); }} />;
      case 'dispute': return <DisputeSheet key={key} data={data} c={o.c} onClose={close}
        onSent={() => { dispatch({ type: 'dispute', id: o.c.id }); toast('Marked as sent — Watchdog keeps an eye on the next bill'); close(); }} />;
      case 'account': return <AccountSheet key={key} data={data} onClose={close} theme={theme} onTheme={setTheme}
        onUseSample={(on) => { dispatch({ type: 'useSample', on }); closeAll(); setTab('home'); toast(on ? 'Sample data back on' : 'Fresh start — add your first bill with +'); }} />;
      case 'counter': return <Counter key={key} data={data} ins={ins} presetSupplier={o.supplierId} onClose={close}
        onHide={(id) => dispatch({ type: 'hide', id })} onLock={(deal) => { dispatch({ type: 'deal', deal }); toast('Deal locked in'); }} />;
      case 'tryBuy': return <TryBuy key={key} data={data} onClose={close}
        onAdd={({ supplierId, amount }) => replace({ type: 'billForm', preset: { supplierId, amount } })} />;
      case 'supplierForm': {
        const supplier = o.id ? data.suppliers.find((s) => s.id === o.id) : null;
        return <SupplierForm key={key} data={data} supplier={supplier} onClose={close}
          onSave={(s, isNew) => { dispatch({ type: 'saveSupplier', supplier: s, isNew }); close(); toast(isNew ? `${s.name} added` : 'Saved'); }} />;
      }
      case 'billForm': {
        const bill = o.id ? data.bills.find((b) => b.id === o.id) : null;
        return <BillForm key={key} data={data} bill={bill} preset={o.preset} onClose={close} onSave={saveBill} onNewSupplier={newSupplier} />;
      }
      case 'bill': {
        const bill = o.pending || data.bills.find((b) => b.id === o.id);
        if (!bill) return null;
        const pending = o.pending && data.queue.some((q) => q.id === o.pending.id) ? o.pending : null;
        return <BillSheet key={key} data={data} bill={bill} pending={pending} onClose={close}
          onConfirm={() => { go.confirm(bill); close(); }}
          onPay={() => { const on = bill.paid == null; dispatch({ type: 'pay', id: bill.id, on }); toast(on ? `${name(bill)} ${money(bill.total)} paid` : 'Marked as not paid'); close(); }}
          onEdit={() => go.editBill(bill.id)}
          onDelete={() => { dispatch({ type: 'deleteBill', id: bill.id }); deletePhoto(bill.id); toast('Bill deleted'); close(); }} />;
      }
      default: return null;
    }
  };

  return (
    <div className="app">
      <main className="scroll" ref={scroller}>
        {tab === 'home' && <Home data={data} ins={ins} go={go} />}
        {tab === 'bills' && <Bills data={data} ins={ins} go={go} />}
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

