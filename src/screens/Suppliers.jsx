import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { PriceSteps } from '../components/Charts.jsx';
import { HoldingRow } from '../components/Rows.jsx';
import { dirClass, kfmt, money, pct } from '../lib/format.js';
import { Heatmap, JobRow } from '../components/Portfolio.jsx';
import { basketIndex, bestPrice, itemChange } from '../lib/model.js';

const SORTS = [
  ['spend', 'Biggest', (a, b) => b.spend - a.spend],
  ['change', 'Rising', (a, b) => b.change - a.change],
  ['owed', 'Owed', (a, b) => b.owed - a.owed],
  ['name', 'A–Z', (a, b) => a.name.localeCompare(b.name)],
];

export default function Suppliers({ data, ins, go }) {
  const [tab, setTab] = useState('suppliers');
  const [sort, setSort] = useState('spend');
  const list = [...ins.ranked].sort(SORTS.find((s) => s[0] === sort)[2]);

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="title">Market</h1>
          <div className="muted num" style={{ fontSize: 15, marginTop: 2 }}>{kfmt(ins.total90)} over 90 days · {ins.spread.count} suppliers · {ins.spread.label.toLowerCase()}</div>
        </div>
        <button className="btn btn-secondary" style={{ height: 44, fontSize: 15 }} onClick={() => go.addSupplier()}><Icon name="plus" size={18} />Add</button>
      </div>
      <Heatmap ranked={ins.ranked} onOpen={go.supplier} height={210} />
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'suppliers'} onClick={() => setTab('suppliers')}>Suppliers</button>
        <button role="tab" aria-selected={tab === 'jobs'} onClick={() => setTab('jobs')}>Jobs</button>
        <button role="tab" aria-selected={tab === 'prices'} onClick={() => setTab('prices')}>Prices</button>
      </div>

      {tab === 'jobs' && (
        <div className="card" style={{ padding: '4px 16px' }}>
          {ins.jobs.map((j) => <JobRow key={j.job} j={j} onOpen={go.job} />)}
          {ins.jobs.length === 0 && <div className="empty"><div className="h2">No jobs yet</div><p className="muted">Put a job name on a bill and it shows up here, with what it's cost so far.</p></div>}
        </div>
      )}

      {tab === 'suppliers' && (
        <>
          <div className="chips" role="group" aria-label="Sort suppliers">
            {SORTS.map(([k, l]) => <button key={k} className="chip" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
          </div>
          <div className="card" style={{ padding: '4px 16px', marginTop: -12 }}>
            {list.map((s) => <HoldingRow key={s.id} s={s} onOpen={go.supplier} show={sort === 'owed' ? 'owed' : 'spend'} />)}
            {list.length === 0 && (
              <div className="empty">
                <div className="h2">No suppliers yet</div>
                <button className="btn btn-primary" onClick={() => go.addSupplier()}>Add your first supplier</button>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'prices' && <Prices data={data} go={go} />}
    </div>
  );
}

function Prices({ data, go }) {
  const name = (id) => data.suppliers.find((s) => s.id === id)?.name ?? id;
  if (!data.items.length) {
    return (
      <div className="card empty">
        <div className="h2">Prices fill in by themselves</div>
        <p className="muted">Once bills come in by email, every line item lands here so you can see what's creeping up.</p>
      </div>
    );
  }
  const basket = basketIndex(data.items);
  const tape = data.items.map((it) => [it.name.split(' ')[0].toUpperCase(), itemChange(it)]);
  return (
    <>
      <div className="card">
        <div className="tile-k">Your inflation</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <span className="num" style={{ fontSize: 40, fontWeight: 750, letterSpacing: '-0.03em' }}>{basket.toFixed(1)}</span>
          <span className={`pill num ${dirClass(basket - 100)}`}>{pct(basket - 100)}</span>
        </div>
        <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>What the stuff you buy every week costs now vs before.</p>
      </div>
      <div className="tape-wrap" aria-hidden="true" style={{ marginTop: -8 }}>
        <div className="tape num">
          {[...tape, ...tape].map(([sym, ch], i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 8 }}><span className="muted">{sym}</span><span className={dirClass(ch)}>{pct(ch)}</span></span>
          ))}
        </div>
      </div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {data.items.map((it) => {
          const [bestId, best] = bestPrice(it);
          const ch = itemChange(it);
          return (
            <button key={it.id} className="holding" onClick={() => go.item(it.id)}>
              <div style={{ minWidth: 0 }}>
                <div className="holding-name" style={{ fontSize: 16 }}>{it.name.split(' · ')[0]}</div>
                <div className="holding-sub">Best {money(best)} · {name(bestId)}{data.alerts[it.id]?.on ? ' · alert on' : ''}</div>
              </div>
              <PriceSteps values={it.history} tone={dirClass(ch)} width={76} height={34} />
              <div className="holding-right">
                <span className="holding-amt num">{money(it.history.at(-1))}</span>
                <span className={`pill num ${dirClass(ch)}`}>{pct(ch)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
