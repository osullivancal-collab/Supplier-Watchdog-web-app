import { FullScreen } from '../components/UI.jsx';
import { dirClass, money, money0, monthName, pct } from '../lib/format.js';
import { itemChange, overpay } from '../lib/model.js';
import { describeDeal, dealLine } from './League.jsx';

export default function Supplier({ data, ins, supplierId, onClose, onOpenItem, onDeal }) {
  const s = ins.ranked.find((x) => x.id === supplierId);
  const max = Math.max(...s.months) || 1;
  const now = new Date().getMonth();
  const over = overpay(data.items, s.id);
  const name = (id) => data.suppliers.find((x) => x.id === id)?.name ?? id;
  const deals = data.deals.filter((d) => d.supplierId === s.id);
  const movers = data.items.filter((it) => it.latest[s.id] != null);

  return (
    <FullScreen label={s.name} onClose={onClose} closeIcon="back" right={<span className="num muted" style={{ fontSize: 12 }}>#{s.rank} of {ins.ranked.length}</span>}>
      <div className="page" style={{ paddingTop: 8 }}>
        <div>
          <div className="muted" style={{ fontSize: 15 }}>{s.name}</div>
          <div className="num" style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em' }}>{money0(s.spend)}</div>
          <div className={`num ${dirClass(s.change)}`}>{pct(s.change)} vs the 90 days before</div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }} role="img" aria-label={`${s.name} spend by calendar month`}>
            {s.months.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: '100%', height: Math.max(2, (v / max) * 90), borderRadius: 4, background: i === s.months.length - 1 ? 'var(--text)' : 'var(--line-2)' }} />
                <span className="faint" style={{ fontSize: 10 }}>{monthName(now - (s.months.length - 1 - i))}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          {[['Share of spend', `${s.share.toFixed(0)}%`], ['Bills · 90 days', String(s.billCount)], ['Average bill', money0(s.avgBill)], ['Terms', s.terms]].map(([k, v]) => (
            <div key={k}><div className="stat-k">{k}</div><div className="num" style={{ fontSize: 16, fontWeight: 600 }}>{v}</div></div>
          ))}
        </div>

        {over.total > 0 && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>About <span className="num up">{money0(over.total)}</span> a quarter over your best price</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {over.lines.map((l) => `${l.item.name.split(' · ')[0]} — ${name(l.bestId)} ${money(l.best)}`).join(' · ')}
            </div>
          </div>
        )}

        {movers.length > 0 && (
          <section style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <h2 className="section-title">Prices on your invoices</h2>
            {movers.map((it) => (
              <button key={it.id} className="row" style={{ minHeight: 52 }} onClick={() => onOpenItem(it.id)}>
                <div className="row-main">
                  <div className="row-title">{it.name}</div>
                  <div className="num row-sub">{money(it.latest[s.id])} {it.unit}</div>
                </div>
                <span className={`num ${dirClass(itemChange(it))}`} style={{ fontSize: 13 }}>{pct(itemChange(it))}</span>
              </button>
            ))}
          </section>
        )}

        <section style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <h2 className="section-title">Deals</h2>
          {deals.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No deals yet.</p>}
          {deals.map((d) => {
            const p = dealLine(d, data.bills);
            return (
              <div key={d.id} className="row" style={{ minHeight: 52 }}>
                <div className="row-main"><div>{describeDeal(d, data.suppliers)}</div><div className="num row-sub">{p.now} · {p.target}</div></div>
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>Active</span>
              </div>
            );
          })}
          <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => onDeal(s.id)}>Make a deal with {s.name}</button>
        </section>
      </div>
    </FullScreen>
  );
}
