import { Sheet } from '../components/UI.jsx';
import { money, money0 } from '../lib/format.js';
import { bestPrice, dealProgress, overpay } from '../lib/model.js';

const MEDAL = ['var(--gold)', 'var(--silver)', 'var(--bronze)'];

export function describeDeal(deal, suppliers) {
  const s = suppliers.find((x) => x.id === deal.supplierId);
  return `${s?.name ?? '?'} · ${deal.kind === 'share' ? `${deal.target}% share` : `${money0(deal.target)} spend`}`;
}

export function dealLine(deal, bills) {
  const p = dealProgress(deal, bills);
  const now = deal.kind === 'share' ? `${p.value.toFixed(0)}% now` : `${money0(p.value)} so far`;
  const target = deal.kind === 'share' ? `target ${deal.target}%` : `target ${money0(deal.target)}`;
  return { ...p, now, target };
}

export default function League({ data, ins, onOpenSupplier, onCounter, onTender }) {
  const top = ins.ranked.slice(0, 3);
  const leader = ins.ranked[0];
  const lev = overpay(data.items, leader.id);
  const ytd = data.bills.filter((b) => b.supplierId === data.rebate.supplierId && b.issued > -365).reduce((t, b) => t + b.total, 0);
  const rebateName = data.suppliers.find((s) => s.id === data.rebate.supplierId)?.name;
  const name = (id) => data.suppliers.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="page">
      <div>
        <h1 className="page-title">League</h1>
        <div className="muted" style={{ fontSize: 13 }}>Last 90 days · ranked by your spend</div>
      </div>

      <div className="podium">
        {[1, 0, 2].map((i) => top[i] && (
          <button key={top[i].id} className="podium-col" onClick={() => onOpenSupplier(top[i].id)}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{top[i].name}</div>
            <div className="num muted" style={{ fontSize: 12, marginBottom: 4 }}>{top[i].share.toFixed(0)}%</div>
            <div className="podium-block num" style={{ height: [132, 100, 78][i], borderTop: `2px solid ${MEDAL[i]}`, color: MEDAL[i] }}>{i + 1}</div>
          </button>
        ))}
      </div>

      <button className="btn btn-primary btn-block" style={{ height: 52 }} onClick={() => onCounter()}>Counter mode</button>

      <section aria-label="Active deals">
        <h2 className="section-title">Active deals</h2>
        {data.deals.length === 0 && <p className="muted" style={{ fontSize: 13 }}>None yet — make one at the counter.</p>}
        {data.deals.map((d) => {
          const p = dealLine(d, data.bills);
          return (
            <div key={d.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>{describeDeal(d, data.suppliers)}</div>
                <div className="num muted" style={{ fontSize: 12, flex: 'none' }}>{p.daysLeft} days left</div>
              </div>
              <div className="bar-track" style={{ marginTop: 10 }}><div className="bar-fill" style={{ width: `${p.pct}%` }} /></div>
              <div className="num muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                <span>{p.now}</span>{p.pct >= 100 ? <span style={{ color: 'var(--accent)' }}>Target hit</span> : <span>{p.target}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{d.reward} · signed with {d.rep || 'the rep'}</div>
            </div>
          );
        })}
      </section>

      <section aria-label="Leverage">
        <h2 className="section-title">Leverage</h2>
        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{rebateName} rebate · {data.rebate.rate * 100}% over {money0(data.rebate.threshold)}</span>
            <span className={`num ${ytd >= data.rebate.threshold ? '' : 'muted'}`} style={ytd >= data.rebate.threshold ? { color: 'var(--accent)' } : null}>
              {ytd >= data.rebate.threshold ? 'Reached' : `${money0(data.rebate.threshold - ytd)} to go`}
            </span>
          </div>
          <div className="bar-track" style={{ marginTop: 10 }}><div className="bar-fill" style={{ width: `${Math.min(100, (ytd / data.rebate.threshold) * 100)}%` }} /></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{money0(ytd)} this year · worth about {money0(Math.max(ytd, data.rebate.threshold) * data.rebate.rate)} back</div>
        </div>
        {lev.lines.map((l) => (
          <div key={l.item.id} className="row" style={{ minHeight: 56 }}>
            <div className="row-main">
              <div className="row-title">{l.item.name}</div>
              <div className="num row-sub">{leader.name} {money(l.mine)} · {name(l.bestId)} {money(l.best)}</div>
            </div>
            <span className="num up" style={{ fontSize: 13 }}>+{l.gapPct.toFixed(1)}%</span>
          </div>
        ))}
        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={onTender}>Put first place up for tender</button>
      </section>

      <section aria-label="Deal history">
        <h2 className="section-title">History</h2>
        {data.pastDeals.map((h) => (
          <div key={h.name} className="row" style={{ minHeight: 52 }}>
            <div className="row-main"><div>{h.name}</div><div className="num row-sub">{h.meta}</div></div>
            <span className={h.won ? 'down' : 'up'} style={{ fontSize: 12 }}>{h.won ? 'Won' : 'Missed'}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

export function TenderSheet({ data, ins, onClose, onSend }) {
  const yearly = data.bills.filter((b) => b.supplierId && b.issued > -365).reduce((t, b) => t + b.total, 0);
  const lows = data.items.map((it) => [it, bestPrice(it)[1]]).slice(0, 3);
  const names = ins.ranked.slice(0, 3).map((s) => s.name).join(', ');
  return (
    <Sheet label="Tender first place" onClose={onClose}>
      <div style={{ fontSize: 17, fontWeight: 600 }}>Tender first place</div>
      <div className="muted" style={{ fontSize: 13 }}>Drafted from your real numbers. Each rep gets a private link to make an offer.</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)', borderLeft: '2px solid var(--line-2)', paddingLeft: 12 }}>
        <div className="muted">To: {names}</div>
        <p style={{ margin: '6px 0 0' }}>
          {data.business.name} spends about <span className="num" style={{ color: 'var(--text)' }}>{money0(Math.round(yearly / 1000) * 1000)} a year</span> on supplies.
          Lowest prices billed this quarter: {lows.map(([it, p]) => `${it.name.split(' · ')[0]} ${money(p)}`).join(', ')}.
          Best rebate and pricing gets first place next quarter. Offers close in 14 days.
        </p>
      </div>
      <button className="btn btn-primary btn-block" onClick={onSend}>Send to 3 reps</button>
    </Sheet>
  );
}
