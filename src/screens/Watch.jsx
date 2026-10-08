import { useState } from 'react';
import { PriceSteps } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import { Sheet } from '../components/UI.jsx';
import { dirClass, money, pct } from '../lib/format.js';
import { basketIndex, bestPrice, itemChange } from '../lib/model.js';

export default function Watch({ data, onOpenItem }) {
  const name = (id) => data.suppliers.find((s) => s.id === id)?.name ?? id;
  const basket = basketIndex(data.items);
  const tape = [...data.items.map((it) => [it.id.toUpperCase(), itemChange(it)]), ['BASKET', basket - 100]];
  return (
    <div style={{ animation: 'rise .25s ease' }}>
      <div style={{ padding: '16px 16px 0' }}>
        <h1 className="page-title">Watch</h1>
        <div className="muted" style={{ fontSize: 13 }}>Unit prices from your own invoices.</div>
      </div>
      <div className="tape-wrap" style={{ marginTop: 14 }} aria-hidden="true">
        <div className="tape num">
          {[...tape, ...tape].map(([sym, ch], i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 6 }}><span className="muted">{sym}</span><span className={dirClass(ch)}>{pct(ch)}</span></span>
          ))}
        </div>
      </div>
      <div style={{ padding: '18px 16px 0' }}>
        <div className="muted" style={{ fontSize: 13 }}>Your Basket Index</div>
        <div className="num" style={{ fontSize: 26, fontWeight: 600 }}>
          {basket.toFixed(1)} <span className={dirClass(basket - 100)} style={{ fontSize: 14 }}>{pct(basket - 100)}</span>
        </div>
        <div className="footnote" style={{ fontSize: 12 }}>Your own inflation — the items you buy again and again, weighted by how many.</div>
      </div>
      <div style={{ padding: '16px 16px 32px' }}>
        {data.items.map((it) => {
          const [bestId, best] = bestPrice(it);
          const ch = itemChange(it);
          return (
            <button key={it.id} className="row" style={{ minHeight: 64 }} onClick={() => onOpenItem(it.id)}>
              <div className="row-main">
                <div className="row-title">{it.name}</div>
                <div className="row-sub">Best <span className="num">{money(best)}</span> · {name(bestId)}</div>
              </div>
              {data.alerts[it.id]?.on && <Icon name="bell" size={14} stroke={2} style={{ color: 'var(--accent)' }} aria-label="Alert set" />}
              <PriceSteps values={it.history} className={dirClass(ch)} />
              <span className={`num ${dirClass(ch)}`} style={{ minWidth: 56, textAlign: 'right', fontSize: 13 }}>{pct(ch)}</span>
            </button>
          );
        })}
        <p className="footnote" style={{ marginTop: 14 }}>Each step is a price on one of your invoices. Read in the same pass as the bill — no extra AI cost.</p>
      </div>
    </div>
  );
}

export function ItemSheet({ data, itemId, onClose, onAlert }) {
  const it = data.items.find((x) => x.id === itemId);
  const prices = Object.entries(it.latest).sort((a, b) => a[1] - b[1]);
  const best = prices[0][1], worst = prices.at(-1)[1];
  const saved = data.alerts[it.id];
  const [at, setAt] = useState(saved?.at ?? Math.ceil(worst * 1.05));
  const on = !!saved?.on;
  const ch = itemChange(it);
  const step = worst > 100 ? 1 : worst > 20 ? 0.5 : 0.1;
  const name = (id) => data.suppliers.find((s) => s.id === id)?.name ?? id;
  return (
    <Sheet label={it.name} onClose={onClose}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{it.name}</div>
        <div className={`num ${dirClass(ch)}`} style={{ fontSize: 13 }}>{pct(ch)} over your last {it.history.length} invoices</div>
      </div>
      <PriceSteps values={it.history} width={358} height={80} className="" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {prices.map(([id, p]) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 92, fontSize: 13, color: 'var(--text-2)' }}>{name(id)}</div>
            <div className="bar-track" style={{ flex: 1, height: 6 }}><div style={{ height: 6, width: `${(p / worst) * 100}%`, background: p === best ? 'var(--down)' : '#3A424D' }} /></div>
            <div className="num" style={{ width: 68, textAlign: 'right', fontSize: 13, color: p === best ? 'var(--down)' : 'var(--text)' }}>{money(p)}</div>
          </div>
        ))}
      </div>
      <div>
        <label htmlFor="alert-at" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
          <span>Alert me if anyone bills above</span><span className="num" style={{ color: 'var(--text)' }}>{money(at)}</span>
        </label>
        <input id="alert-at" type="range" min={Math.floor(best * 0.9)} max={Math.ceil(worst * 1.15)} step={step} value={at}
          onChange={(e) => setAt(Number(e.target.value))} style={{ marginTop: 8 }} />
      </div>
      {on && at !== saved.at ? (
        <button className="btn btn-block btn-primary" onClick={() => onAlert(it, at, true)}>Update alert</button>
      ) : (
        <button className={`btn btn-block ${on ? 'btn-ghost' : 'btn-primary'}`} onClick={() => onAlert(it, at, !on)}>
          {on ? 'Remove alert' : 'Set alert'}
        </button>
      )}
    </Sheet>
  );
}
