import { useMemo, useState } from 'react';
import { DotChart, PriceSteps } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import { BillRow } from '../components/Rows.jsx';
import { FullScreen, useToast } from '../components/UI.jsx';
import { dayLabel, dirClass, money, money0, pct, whenDue } from '../lib/format.js';
import { itemChange, overpay, spendBuckets } from '../lib/model.js';
import { bucketDescriber } from '../lib/buckets.js';
import { describeDeal, dealLine } from './Deals.jsx';

const RANGES = ['3M', '6M', '1Y'];

export default function Supplier({ data, ins, supplierId, go, onClose }) {
  const toast = useToast();
  const [range, setRange] = useState('3M');
  const nameOf = (id) => data.suppliers.find((x) => x.id === id)?.name || id || 'Other';
  const buckets = useMemo(() => spendBuckets(data.bills, range, { supplierId }), [data.bills, range, supplierId]);
  const s = ins.ranked.find((x) => x.id === supplierId);
  if (!s) return null;
  const tone = dirClass(s.change);
  const over = overpay(data.items, s.id);
  const deals = data.deals.filter((d) => d.supplierId === s.id);
  const items = data.items.filter((it) => it.latest[s.id] != null);
  const recent = data.bills.filter((b) => b.supplierId === s.id && b.paid != null && b.paid > -60).sort((a, b) => b.issued - a.issued).slice(0, 5);
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Press and hold to copy'); }
  };

  return (
    <FullScreen label={s.name} onClose={onClose} right={
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="icon-btn" aria-label={`Edit ${s.name}`} onClick={() => go.editSupplier(s.id)}><Icon name="edit" size={18} /></button>
      </div>
    }>
      <div style={{ padding: '4px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="title">{s.name}</h1>
          {s.rank <= 3 && s.spend > 0 && <span className="tag" style={{ color: ['var(--gold)', 'var(--silver)', 'var(--bronze)'][s.rank - 1] }}>#{s.rank}</span>}
        </div>
        <div className="hero-label" style={{ marginTop: 8 }}>Last 90 days</div>
        <div className="hero-value num">{money0(s.spend)}</div>
        <div className="hero-change">
          {s.spend > 0 && <span className={`pill num ${tone}`}>{pct(s.change)}</span>}
          <span className="muted">vs the 90 days before</span>
        </div>
      </div>
      <div style={{ padding: '14px 16px 0' }}>
        <section className="card">
          <div className="seg" role="tablist" aria-label="Range">
            {RANGES.map((r) => <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}>{r}</button>)}
          </div>
          <div style={{ marginTop: 12 }}><DotChart key={range} data={buckets} describe={bucketDescriber(buckets.unit, nameOf)} /></div>
        </section>
      </div>

      <div className="page" style={{ paddingTop: 24 }}>
        <div className="tiles">
          <div className="tile">
            <span className="tile-k">You owe them</span>
            <span className={`tile-v num ${s.owed > 0 ? '' : 'muted'}`}>{money0(s.owed)}</span>
            <span className={`tile-sub ${s.next && s.next.due < 0 ? 'up' : 'muted'}`}>{s.next ? whenDue(s.next.due) : 'Nothing owing'}</span>
          </div>
          <div className="tile">
            <span className="tile-k">Share of spend</span>
            <span className="tile-v num">{s.share.toFixed(0)}%</span>
            <span className="tile-sub muted">{s.billCount} bills · avg {money0(s.avgBill)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => go.addBill(s.id)}><Icon name="plus" size={18} />Add bill</button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => go.counter(s.id)}><Icon name="handshake" size={18} />Make a deal</button>
        </div>

        {(s.rep || s.phone || s.account || s.terms) && (
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {s.rep && <Line k="Rep" v={s.rep} />}
            {s.branch && <Line k="Branch" v={s.branch} />}
            {s.terms && <Line k="Terms" v={s.terms} />}
            {s.phone && <Line k="Phone" v={s.phone} />}
            {s.account && <Line k="Account no." v={s.account} action={<button className="icon-btn" aria-label="Copy account number" onClick={() => copy(s.account)}><Icon name="copy" size={17} /></button>} />}
            {s.phone && <a className="btn btn-secondary btn-block" href={`tel:${s.phone.replace(/\s/g, '')}`}><Icon name="phone" size={18} />Call {s.rep && s.rep !== 'Trade desk' ? s.rep.split(' ')[0] : s.name}</a>}
          </section>
        )}

        {over.total > 0 && (
          <section className="card" style={{ background: 'var(--up-soft)' }}>
            <div className="tile-k" style={{ color: 'var(--up)' }}>Paying over your best price</div>
            <div className="num up" style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{money0(over.total)}<span style={{ fontSize: 15, fontWeight: 600 }}> a quarter</span></div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {over.lines.map((l) => (
                <div key={l.item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 15 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.item.name.split(' · ')[0]}</span>
                  <span className="num" style={{ flex: 'none' }}>{data.suppliers.find((x) => x.id === l.bestId)?.name} {money(l.best)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {s.open.length > 0 && (
          <section>
            <h2 className="h2" style={{ marginBottom: 6 }}>To pay</h2>
            <div className="card" style={{ padding: '2px 16px' }}>
              {s.open.map((b) => <BillRow key={b.id} bill={b} suppliers={data.suppliers} onOpen={go.bill} />)}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="h2" style={{ marginBottom: 6 }}>Recently paid</h2>
            <div className="card" style={{ padding: '2px 16px' }}>
              {recent.map((b) => <BillRow key={b.id} bill={b} suppliers={data.suppliers} onOpen={go.bill} showPaid />)}
            </div>
          </section>
        )}

        {items.length > 0 && (
          <section>
            <h2 className="h2" style={{ marginBottom: 6 }}>Their prices</h2>
            <div className="card" style={{ padding: '4px 16px' }}>
              {items.map((it) => {
                const ch = itemChange(it);
                return (
                  <button key={it.id} className="holding" onClick={() => go.item(it.id)}>
                    <div style={{ minWidth: 0 }}><div className="holding-name" style={{ fontSize: 16 }}>{it.name.split(' · ')[0]}</div><div className="holding-sub">{it.unit}</div></div>
                    <PriceSteps values={it.history} tone={dirClass(ch)} width={76} height={34} />
                    <div className="holding-right"><span className="holding-amt num">{money(it.latest[s.id])}</span><span className={`pill num ${dirClass(ch)}`}>{pct(ch)}</span></div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {deals.length > 0 && (
          <section>
            <h2 className="h2" style={{ marginBottom: 10 }}>Deals</h2>
            {deals.map((d) => {
              const p = dealLine(d, data.bills);
              return (
                <div key={d.id} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>{describeDeal(d, data.suppliers)}</div>
                  <div className="bar-track" style={{ marginTop: 12 }}><div className="bar-fill" style={{ width: `${p.pct}%` }} /></div>
                  <div className="num muted" style={{ marginTop: 8, fontSize: 14 }}>{p.now} · {p.target}</div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </FullScreen>
  );
}

function Line({ k, v, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span className="muted" style={{ fontSize: 15 }}>{k}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, minWidth: 0 }}>
        <span className="num" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>{action}
      </span>
    </div>
  );
}
