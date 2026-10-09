import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { BillRow } from '../components/Rows.jsx';
import { useCountUp } from '../components/UI.jsx';
import { dayLabel, money, money0 } from '../lib/format.js';
import { vendorName } from '../lib/store.js';

const GROUPS = [
  ['Overdue', (b) => b.due < 0],
  ['This week', (b) => b.due >= 0 && b.due <= 6],
  ['Next week', (b) => b.due > 6 && b.due <= 13],
  ['Later', (b) => b.due > 13],
];

export default function Bills({ data, ins, go }) {
  const [tab, setTab] = useState(data.queue.length ? 'confirm' : 'pay');
  const [job, setJob] = useState(null);
  const owed = useCountUp(ins.owed);
  const name = (b) => vendorName(b, data.suppliers);
  const byJob = (b) => !job || b.job === job;
  const open = ins.open.filter(byJob);
  const paid = data.bills.filter((b) => b.paid != null && b.paid >= -60 && b.paid <= 0 && byJob(b)).sort((a, b) => b.paid - a.paid).slice(0, 40);

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="title">Bills</h1>
          <div className="num" style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{money(owed)} <span className="muted" style={{ fontWeight: 500 }}>owed</span></div>
        </div>
        <button className="btn btn-secondary" style={{ height: 44, fontSize: 15 }} onClick={() => go.addBill()}><Icon name="plus" size={18} />Add</button>
      </div>

      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'pay'} onClick={() => setTab('pay')}>To pay</button>
        <button role="tab" aria-selected={tab === 'confirm'} onClick={() => setTab('confirm')}>New{data.queue.length ? ` · ${data.queue.length}` : ''}</button>
        <button role="tab" aria-selected={tab === 'paid'} onClick={() => setTab('paid')}>Paid</button>
      </div>

      {tab !== 'confirm' && data.jobs.length > 0 && (
        <div className="chips" role="group" aria-label="Filter by job" style={{ marginTop: -12 }}>
          <button className="chip" aria-pressed={!job} onClick={() => setJob(null)}>All jobs</button>
          {data.jobs.map((j) => <button key={j} className="chip" aria-pressed={job === j} onClick={() => setJob(j)}>{j}</button>)}
        </div>
      )}

      {tab === 'confirm' && (
        data.queue.length === 0
          ? <div className="card empty"><Icon name="check" size={32} style={{ color: 'var(--down)' }} /><div className="h2">All caught up</div><p className="muted">Bills emailed to you land here to check.</p></div>
          : data.queue.map((q) => (
            <div key={q.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: -12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{name(q)}</div>
                  <div className="muted" style={{ fontSize: 14 }}>Due {dayLabel(q.due)}</div>
                </div>
                <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>{money(q.total)}</div>
              </div>
              {q.flag && <span className={`tag ${q.flag.kind === 'duplicate' ? 'warn' : 'up'}`} style={{ height: 'auto', padding: '8px 10px', lineHeight: 1.35, fontSize: 14 }}>{q.flag.text}</span>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => go.bill(q.id, q)}>Check</button>
                <button className="btn btn-primary" style={{ flex: 1.5 }} onClick={() => go.confirm(q)}>Confirm</button>
              </div>
            </div>
          ))
      )}

      {tab === 'pay' && (
        open.length === 0
          ? <div className="card empty"><Icon name="check" size={32} style={{ color: 'var(--down)' }} /><div className="h2">Nothing owing</div><button className="btn btn-primary" onClick={() => go.addBill()}>Add a bill</button></div>
          : GROUPS.map(([title, test]) => {
            const list = open.filter(test);
            if (!list.length) return null;
            return (
              <section key={title}>
                <div className="section-head" style={{ marginBottom: 6 }}>
                  <h2 className={`h2 ${title === 'Overdue' ? 'up' : ''}`}>{title}</h2>
                  <span className="num" style={{ fontSize: 16, fontWeight: 700 }}>{money0(list.reduce((t, b) => t + b.total, 0))}</span>
                </div>
                <div className="card" style={{ padding: '2px 16px' }}>
                  {list.map((b) => <BillRow key={b.id} bill={b} suppliers={data.suppliers} onOpen={go.bill} />)}
                </div>
              </section>
            );
          })
      )}

      {tab === 'paid' && (
        <div className="card" style={{ padding: '2px 16px', marginTop: -12 }}>
          {paid.map((b) => <BillRow key={b.id} bill={b} suppliers={data.suppliers} onOpen={go.bill} showPaid />)}
          {paid.length === 0 && <p className="muted" style={{ padding: '18px 0' }}>Nothing paid in the last 60 days.</p>}
        </div>
      )}
    </div>
  );
}
