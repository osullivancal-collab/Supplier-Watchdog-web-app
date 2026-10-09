import { dateParts, dirClass, kfmt, money, money0, pct, whenDue } from '../lib/format.js';
import { vendorName } from '../lib/store.js';
import { Spark } from './Charts.jsx';
import Icon from './Icon.jsx';

/** A supplier as a "holding": name, sparkline, spend and a solid change pill. */
const AVATARS = [['var(--hero)', 'var(--accent)'], ['var(--card-2)', 'var(--text)'], ['var(--due-soft)', 'var(--due)'], ['var(--down-soft)', 'var(--down)'], ['var(--up-soft)', 'var(--up)']];
export const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function HoldingRow({ s, onOpen, show = 'change', index = 0 }) {
  const [avBg, avFg] = AVATARS[index % AVATARS.length];
  const tone = dirClass(s.change);
  const sub = s.spend > 0
    ? `${s.share.toFixed(0)}%${s.owed > 0 ? ` · ${kfmt(s.owed)} owed` : ' of spend'}`
    : 'No bills yet';
  return (
    <button className="holding" onClick={() => onOpen(s.id)} style={{ gridTemplateColumns: '40px minmax(0, 1fr) 56px auto', gap: 10 }}>
      <span className="avatar-tile" style={{ background: avBg, color: avFg }}>{initials(s.name)}</span>
      <div style={{ minWidth: 0 }}>
        <div className="holding-name">{s.name}</div>
        <div className="holding-sub num">{sub}</div>
      </div>
      <Spark values={s.spark} tone={tone} width={56} />
      <div className="holding-right">
        <span className="holding-amt num">{money0(show === 'owed' ? s.owed : s.spend)}</span>
        <span className={`pill num ${s.spend > 0 ? tone : 'flat'}`}>{s.spend > 0 ? pct(s.change) : '—'}</span>
      </div>
    </button>
  );
}

/** A bill: date tile, who, and how much. Overdue bills turn orange. */
export function BillRow({ bill, suppliers, onOpen, showPaid }) {
  const d = dateParts(bill.paid != null && showPaid ? bill.paid : bill.due);
  const overdue = bill.paid == null && bill.total > 0 && bill.due < 0;
  const credit = bill.total < 0;
  const sub = [
    bill.paid != null && showPaid ? 'Paid' : whenDue(bill.due),
    bill.job || bill.ref,
  ].filter(Boolean).join(' · ');
  return (
    <button className="bill" onClick={() => onOpen(bill.id)}>
      <div className={`date-tile ${overdue ? 'up' : ''}`}><b className="num">{d.day}</b><span>{d.mon}</span></div>
      <div style={{ minWidth: 0 }}>
        <div className="bill-name">{vendorName(bill, suppliers)}{bill.photo ? <Icon name="camera" size={14} style={{ marginLeft: 6, verticalAlign: -1, color: 'var(--muted)' }} /> : null}</div>
        <div className={`bill-sub ${overdue ? 'up' : ''}`}>{sub}</div>
      </div>
      <div className={`bill-amt num ${credit ? 'down' : ''}`}>{money(bill.total)}</div>
    </button>
  );
}
