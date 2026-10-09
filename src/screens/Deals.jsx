import Icon from '../components/Icon.jsx';
import { Sheet } from '../components/UI.jsx';
import { money, money0 } from '../lib/format.js';
import { bestPrice, dealProgress, overpay } from '../lib/model.js';

const MEDAL = ['var(--gold)', 'var(--silver)', 'var(--bronze)'];

export function describeDeal(deal, suppliers) {
  const s = suppliers.find((x) => x.id === deal.supplierId);
  return `${s?.name ?? '?'} · ${deal.kind === 'share' ? `${deal.target}% of spend` : `${money0(deal.target)} spend`}`;
}

export function dealLine(deal, bills) {
  const p = dealProgress(deal, bills);
  const now = deal.kind === 'share' ? `${p.value.toFixed(0)}% now` : `${money0(p.value)} so far`;
  const target = deal.kind === 'share' ? `target ${deal.target}%` : `target ${money0(deal.target)}`;
  return { ...p, now, target };
}

export default function Deals({ data, ins, go }) {
  const ranked = ins.ranked.filter((s) => s.spend > 0);
  const top = ranked.slice(0, 3);
  const leader = ranked[0];
  const lev = leader ? overpay(data.items, leader.id) : { lines: [] };
  const rb = data.rebate;
  const ytd = rb ? data.bills.filter((b) => b.supplierId === rb.supplierId && b.issued > -365).reduce((t, b) => t + b.total, 0) : 0;
  const name = (id) => data.suppliers.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div>
        <h1 className="title">Deals</h1>
        <p className="muted" style={{ marginTop: 4 }}>Who's winning your money</p>
      </div>

      {top.length > 0 && (
        <div className="podium">
          {[1, 0, 2].map((i) => top[i] && (
            <button key={top[i].id} className="podium-col" onClick={() => go.supplier(top[i].id)}>
              <div style={{ fontSize: 16, fontWeight: 800, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top[i].name}</div>
              <div className="num muted" style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{top[i].share.toFixed(0)}%</div>
              <div className="podium-block num" style={{ height: [140, 104, 80][i], background: `color-mix(in srgb, ${MEDAL[i]} 16%, var(--card))`, color: MEDAL[i] }}>{i + 1}</div>
            </button>
          ))}
        </div>
      )}

      <button className="card card-tap" onClick={() => go.counter()} style={{ background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Icon name="handshake" size={30} />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 20, fontWeight: 800 }}>Counter mode</span>
          <span style={{ fontSize: 15, fontWeight: 600, opacity: .8 }}>Show the rep your numbers. Shake on it.</span>
        </span>
        <Icon name="chevron" size={22} />
      </button>

      <section>
        <h2 className="h2" style={{ marginBottom: 10 }}>Active deals</h2>
        {data.deals.length === 0 && <div className="card muted">None yet — make one at the counter.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.deals.map((d) => {
            const p = dealLine(d, data.bills);
            const hit = p.pct >= 100;
            return (
              <div key={d.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{describeDeal(d, data.suppliers)}</div>
                  <span className={`tag ${hit ? '' : ''}`} style={hit ? { background: 'var(--down-soft)', color: 'var(--down)' } : null}>{hit ? 'Hit' : `${p.daysLeft}d left`}</span>
                </div>
                <div className="bar-track" style={{ marginTop: 14 }}><div className="bar-fill" style={{ width: `${p.pct}%` }} /></div>
                <div className="num" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 15, fontWeight: 600 }}>
                  <span>{p.now}</span><span className="muted">{p.target}</span>
                </div>
                <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Reward: {d.reward}{d.rep ? ` · with ${d.rep}` : ''}</div>
              </div>
            );
          })}
        </div>
      </section>

      {rb && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{name(rb.supplierId)} rebate</div>
            <span className="tag">{rb.rate * 100}% over {money0(rb.threshold)}</span>
          </div>
          <div className="bar-track" style={{ marginTop: 14 }}><div className="bar-fill" style={{ width: `${Math.min(100, (ytd / rb.threshold) * 100)}%` }} /></div>
          <div className="num" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 15, fontWeight: 600 }}>
            <span>{money0(ytd)} this year</span>
            <span className={ytd >= rb.threshold ? 'down' : 'muted'}>{ytd >= rb.threshold ? 'Reached' : `${money0(rb.threshold - ytd)} to go`}</span>
          </div>
          <div className="down" style={{ marginTop: 8, fontWeight: 700 }}>≈ {money0(Math.max(ytd, rb.threshold) * rb.rate)} back to you</div>
        </section>
      )}

      {lev.lines.length > 0 && (
        <section>
          <h2 className="h2">Your ammo</h2>
          <p className="muted" style={{ margin: '4px 0 10px' }}>Where others billed you less than {leader.name}</p>
          <div className="card" style={{ padding: '4px 16px' }}>
            {lev.lines.map((l) => (
              <div key={l.item.id} className="holding" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="holding-name" style={{ fontSize: 16 }}>{l.item.name.split(' · ')[0]}</div>
                  <div className="holding-sub num">{leader.name} {money(l.mine)} · {name(l.bestId)} {money(l.best)}</div>
                </div>
                <span className="pill up num">+{l.gapPct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={go.tender}>Put first place up for tender</button>
        </section>
      )}

      {data.pastDeals.length > 0 && (
        <section>
          <h2 className="h2" style={{ marginBottom: 6 }}>History</h2>
          <div className="card" style={{ padding: '4px 16px' }}>
            {data.pastDeals.map((h) => (
              <div key={h.name} className="holding" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', minHeight: 60 }}>
                <div style={{ minWidth: 0 }}><div className="holding-name" style={{ fontSize: 16 }}>{h.name}</div><div className="holding-sub">{h.meta}</div></div>
                <span className={`pill ${h.won ? 'down' : 'up'}`}>{h.won ? 'Won' : 'Missed'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function TenderSheet({ data, ins, onClose, onSend }) {
  const yearly = data.bills.filter((b) => b.supplierId && b.issued > -365).reduce((t, b) => t + b.total, 0);
  const lows = data.items.map((it) => [it, bestPrice(it)[1]]).slice(0, 3);
  const names = ins.ranked.filter((s) => s.spend > 0).slice(0, 3).map((s) => s.name).join(', ');
  return (
    <Sheet title="Tender first place" onClose={onClose}>
      <p className="muted">Written from your real numbers. Each rep gets a private link to make an offer.</p>
      <div className="card" style={{ background: 'var(--bg)', fontSize: 16, lineHeight: 1.55 }}>
        <div className="muted" style={{ fontSize: 14, marginBottom: 6 }}>To: {names}</div>
        {data.business.name} spends about <b className="num">{money0(Math.round(yearly / 1000) * 1000)} a year</b> on supplies.
        {lows.length > 0 && <> Best prices I've been billed lately: {lows.map(([it, p]) => `${it.name.split(' · ')[0]} ${money(p)}`).join(', ')}.</>}
        {' '}Best rebate and pricing gets first place next quarter. Offers close in 14 days.
      </div>
      <button className="btn btn-primary btn-block" onClick={onSend}>Send to reps</button>
    </Sheet>
  );
}
