import { dayLabel, money } from '../lib/format.js';
import { vendorName } from '../lib/store.js';

const GROUPS = [
  ['Overdue', (b) => b.due < 0, 'up'],
  ['This week', (b) => b.due >= 0 && b.due <= 6, null],
  ['Later', (b) => b.due > 6, null],
];

export default function Bills({ data, ins, onConfirm, onPay, onCheck }) {
  const name = (b) => vendorName(b, data.suppliers);
  return (
    <div className="page">
      <div>
        <h1 className="page-title">Bills</h1>
        <div className="num muted" style={{ fontSize: 13 }}>Owed {money(ins.owed)} · next 30 days {money(ins.shock.next30)}</div>
      </div>

      {data.queue.length > 0 && (
        <section aria-label="Bills to confirm">
          <h2 className="section-title" style={{ marginBottom: 8 }}>To confirm</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.queue.map((q) => (
              <div key={q.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{name(q)}</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>{money(q.total)}</div>
                </div>
                <div className="num muted" style={{ fontSize: 12, marginTop: -6 }}>{q.ref} · due {dayLabel(q.due)} · {q.confidence}% read</div>
                {q.flag && <div style={{ fontSize: 13, color: q.flag.kind === 'duplicate' ? 'var(--warn)' : 'var(--up)' }}>{q.flag.text}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, height: 44 }} onClick={() => onCheck(q)}>Check</button>
                  <button className="btn btn-primary" style={{ flex: 1.4, height: 44, fontSize: 14 }} onClick={() => onConfirm(q)}>Confirm</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {GROUPS.map(([title, test, tone]) => {
        const list = ins.open.filter(test);
        if (!list.length) return null;
        return (
          <section key={title} aria-label={title}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 className="section-title" style={tone ? { color: `var(--${tone})` } : null}>{title}</h2>
              <span className="num muted" style={{ fontSize: 13 }}>{money(list.reduce((t, b) => t + b.total, 0))}</span>
            </div>
            {list.map((b) => (
              <div key={b.id} className="row">
                <div className="row-main">
                  <div className="row-title">{name(b)}</div>
                  <div className={`num ${b.due < 0 ? 'up' : 'muted'}`} style={{ fontSize: 12 }}>
                    {b.ref} · {b.due < 0 ? `${-b.due} days overdue` : dayLabel(b.due)}
                  </div>
                </div>
                <div className="num">{money(b.total)}</div>
                <button className="btn btn-ghost btn-sm" aria-label={`Mark ${name(b)} ${b.ref} paid`} onClick={() => onPay(b)}>Paid</button>
              </div>
            ))}
          </section>
        );
      })}
      <p className="footnote">Bills 14+ days overdue are assumed paid. Xero stays the source of truth.</p>
    </div>
  );
}
