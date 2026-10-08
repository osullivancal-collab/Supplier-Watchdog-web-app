import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './components/Icon.jsx';
import { Sheet, ToastProvider, useToast } from './components/UI.jsx';
import { money } from './lib/format.js';
import { useInsights } from './lib/insights.js';
import { useStore, vendorName } from './lib/store.js';
import Bills from './screens/Bills.jsx';
import Counter from './screens/Counter.jsx';
import League, { TenderSheet } from './screens/League.jsx';
import Market from './screens/Market.jsx';
import Supplier from './screens/Supplier.jsx';
import Watch, { ItemSheet } from './screens/Watch.jsx';

const TABS = [['market', 'Market'], ['bills', 'Bills'], ['watch', 'Watch'], ['league', 'League']];

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}

/**
 * Overlays (supplier page, sheets, counter mode) sit on a stack that is mirrored
 * into browser history, so the phone's back button / swipe closes the top one
 * instead of leaving the app.
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
  const close = useCallback(() => { if (depth.current > 0) history.back(); }, []);
  const closeAll = useCallback(() => { if (depth.current > 0) history.go(-depth.current); }, []);
  return { stack, open, close, closeAll };
}

function Shell() {
  const [data, dispatch] = useStore();
  const ins = useInsights(data);
  const toast = useToast();
  const [tab, setTab] = useState('market');
  const scroller = useRef(null);
  const { stack, open, close, closeAll } = useOverlays();
  const name = (b) => vendorName(b, data.suppliers);

  const goTab = (t) => { closeAll(); setTab(t); scroller.current?.scrollTo(0, 0); };
  const confirm = (q) => {
    dispatch({ type: 'confirm', id: q.id });
    try { navigator.vibrate?.(10); } catch { /* not supported */ }
    toast(`${name(q)} ${money(q.total)} added`);
  };
  const pay = (b) => { dispatch({ type: 'pay', id: b.id }); toast(`${name(b)} ${money(b.total)} marked paid`); };
  const openSupplier = (id) => open({ type: 'supplier', id });
  const openItem = (id) => open({ type: 'item', id });
  const openCounter = (supplierId) => open({ type: 'counter', supplierId });

  const shared = { data, ins };
  return (
    <div className="app">
      <main className="scroll" ref={scroller}>
        {tab === 'market' && <Market {...shared} onConfirm={confirm} onOpenSupplier={openSupplier} onTab={goTab} onAccount={() => open({ type: 'account' })} />}
        {tab === 'bills' && <Bills {...shared} onConfirm={confirm} onPay={pay} onCheck={() => toast('Shows the PDF beside each field once email-in is connected')} />}
        {tab === 'watch' && <Watch {...shared} onOpenItem={openItem} />}
        {tab === 'league' && <League {...shared} onOpenSupplier={openSupplier} onCounter={() => openCounter()} onTender={() => open({ type: 'tender' })} />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(([k, label]) => (
          <button key={k} className="tab" aria-current={tab === k && !stack.length ? 'page' : undefined} onClick={() => goTab(k)}>
            <Icon name={k} />
            {label}
            {k === 'bills' && data.queue.length > 0 && <span className="badge num" aria-label={`${data.queue.length} to confirm`}>{data.queue.length}</span>}
          </button>
        ))}
      </nav>

      {stack.map((o, i) => {
        const key = `${o.type}-${i}`;
        if (o.type === 'supplier') return <Supplier key={key} {...shared} supplierId={o.id} onClose={close} onOpenItem={openItem} onDeal={(id) => openCounter(id)} />;
        if (o.type === 'item') return <ItemSheet key={key} {...shared} itemId={o.id} onClose={close}
          onAlert={(it, at, on) => { dispatch({ type: 'alert', itemId: it.id, at, on }); toast(on ? `Alert set at ${money(at)}` : 'Alert removed'); close(); }} />;
        if (o.type === 'tender') return <TenderSheet key={key} {...shared} onClose={close} onSend={() => { toast('Draft saved — sending goes live with email-in'); close(); }} />;
        if (o.type === 'counter') return <Counter key={key} {...shared} presetSupplier={o.supplierId} onClose={close}
          onHide={(id) => dispatch({ type: 'hide', id })} onLock={(deal) => { dispatch({ type: 'deal', deal }); toast('Deal locked'); }} />;
        if (o.type === 'account') return <AccountSheet key={key} data={data} onClose={close} onReset={() => { dispatch({ type: 'reset' }); toast('Sample data reset'); close(); }} />;
        return null;
      })}
    </div>
  );
}

function AccountSheet({ data, onClose, onReset }) {
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.business.forwardAddress); toast('Address copied'); }
    catch { toast('Could not copy — press and hold the address instead'); }
  };
  return (
    <Sheet label="Account" onClose={onClose}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{data.business.name}</div>
        <div className="muted" style={{ fontSize: 13 }}>{data.business.owner}</div>
      </div>
      <div>
        <div className="field-label">Forward supplier bills to</div>
        <div className="num" style={{ fontSize: 15, userSelect: 'all', wordBreak: 'break-all' }}>{data.business.forwardAddress}</div>
        <p className="footnote" style={{ marginTop: 6 }}>Set this as the billing email with each supplier and bills arrive on their own.</p>
      </div>
      <button className="btn btn-ghost btn-block" onClick={copy}>Copy address</button>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>You're looking at sample data. Changes you make are kept on this phone only.</p>
        <button className="btn btn-ghost btn-block" onClick={onReset}>Reset sample data</button>
      </div>
    </Sheet>
  );
}
