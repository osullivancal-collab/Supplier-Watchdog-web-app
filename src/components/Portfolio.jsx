// Portfolio pieces built from bills alone: ticker tape, stat pills, supplier
// heatmap, bill calendar, job rows, and the sheets behind the pills.
import { useMemo, useState } from 'react';
import { Spark } from './Charts.jsx';
import Icon from './Icon.jsx';
import { Sheet } from './UI.jsx';
import { dayLabel, dirClass, kfmt, money, money0, pct } from '../lib/format.js';
import { monthGrid, symbol, treemap } from '../lib/portfolio.js';
import { vendorName } from '../lib/store.js';

const longDate = (d) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });

/** Suppliers scrolling past like shares. Tap one to open it. */
export function Ticker({ ranked, onOpen }) {
  const items = ranked.filter((s) => s.spend > 0);
  if (!items.length) return null;
  const row = items.map((s) => (
    <button key={s.id} className="tick" onClick={() => onOpen(s.id)} tabIndex={-1}>
      <b>{symbol(s.name)}</b>
      <span className="num">{kfmt(s.spend)}</span>
      <span className={`num ${dirClass(s.change)}`}>{pct(s.change)}</span>
    </button>
  ));
  return (
    <div className="ticker" aria-label="Supplier ticker: 90-day spend and change">
      <div className="ticker-track" style={{ animationDuration: `${Math.max(18, items.length * 6)}s` }}>
        <div className="ticker-set">{row}</div>
        <div className="ticker-set" aria-hidden="true">{row}</div>
      </div>
    </div>
  );
}

/** A row of small stat cards that scrolls sideways, like the stats under a share chart. */
export function StatPills({ pills }) {
  return (
    <div className="stats" role="list" aria-label="Your numbers">
      {pills.filter(Boolean).map((p) => (
        <button key={p.key} role="listitem" className="stat" onClick={p.onClick}>
          <span className="stat-k">{p.label}</span>
          <span className={`stat-v num ${p.tone || ''}`}>{p.value}</span>
          <span className={`stat-s ${p.subTone || ''}`}>{p.sub}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Where the money goes: tile size = last 90 days' spend, colour = change vs
 * the 90 days before (red = paying more, green = paying less).
 */
export function Heatmap({ ranked, onOpen, height = 230 }) {
  const items = ranked.filter((s) => s.spend > 0);
  const rects = useMemo(() => treemap(items.map((s) => ({ ...s, value: s.spend })), 100, 100), [items]);
  if (!rects.length) return null;
  const tint = (c) => {
    const k = Math.min(1, Math.abs(c) / 30);
    if (Math.abs(c) < 1) return 'var(--card-2)';
    return `color-mix(in srgb, var(--${c > 0 ? 'up' : 'down'}) ${Math.round(18 + k * 62)}%, var(--card))`;
  };
  return (
    <div className="heat" style={{ height }} role="list" aria-label="Supplier heatmap">
      {rects.map((r) => {
        const big = r.w > 22 && r.h > 30, mid = r.w > 9 && r.h > 12;
        const strong = Math.abs(r.change) >= 12;
        return (
          <button key={r.id} role="listitem" className={`heat-tile ${big ? '' : 'small'}`} onClick={() => onOpen(r.id)}
            aria-label={`${r.name}: ${money0(r.spend)}, ${pct(r.change)}`}
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, background: tint(r.change), color: strong ? '#FFFFFF' : 'var(--text)' }}>
            {mid && <span className="heat-name">{big ? r.name : symbol(r.name)}</span>}
            {mid && <span className="heat-pct num">{big ? pct(r.change) : `${r.change > 0 ? '+' : r.change < 0 ? '−' : ''}${Math.abs(r.change).toFixed(0)}%`}</span>}
            {big && <span className="heat-amt num">{kfmt(r.spend)} · {r.share.toFixed(0)}%</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A month of due dates. Heavier days are darker; tap a day to see what's due. */
export function BillCalendar({ bills, suppliers, onOpenBill }) {
  const now = new Date();
  const [month, setMonth] = useState(0);              // 0 = this month
  const [picked, setPicked] = useState(null);
  const at = new Date(now.getFullYear(), now.getMonth() + month, 1);
  const grid = useMemo(() => monthGrid(bills, at.getFullYear(), at.getMonth(), now), [bills, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const cell = picked != null ? grid.cells.find((c) => c && c.off === picked) : null;
  const move = (n) => { setMonth((m) => Math.max(-1, Math.min(3, m + n))); setPicked(null); };
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="icon-btn" aria-label="Previous month" onClick={() => move(-1)} disabled={month <= -1}><Icon name="back" size={20} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{grid.label}</div>
          <div className="muted num" style={{ fontSize: 13 }}>{money0(grid.total)} falling due</div>
        </div>
        <button className="icon-btn" aria-label="Next month" onClick={() => move(1)} disabled={month >= 3}><Icon name="chevron" size={20} /></button>
      </div>
      <div className="cal">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
        {grid.cells.map((c, i) => (c ? (
          <button key={i} className={`cal-day ${c.off === 0 ? 'today' : ''} ${c.off < 0 ? 'past' : ''}`} aria-pressed={picked === c.off}
            aria-label={`${dayLabel(c.off)}: ${c.total ? money0(c.total) + ' due' : 'nothing due'}`}
            onClick={() => setPicked(picked === c.off ? null : c.off)}
            style={c.total ? { background: `color-mix(in srgb, var(--due) ${Math.round(14 + (c.total / grid.max) * 60)}%, var(--card))` } : null}>
            <span>{c.day}</span>
            {c.total > 0 && <span className="cal-amt num">{kfmt(c.total).replace('$', '')}</span>}
          </button>
        ) : <span key={i} />))}
      </div>
      {cell && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          <div className="label">{dayLabel(cell.off)}{cell.total ? ` · ${money(cell.total)}` : ''}</div>
          {cell.due.length === 0 && <div className="muted" style={{ fontSize: 14 }}>Nothing due that day.</div>}
          {cell.due.map((b) => (
            <button key={b.id} className="cal-bill" onClick={() => onOpenBill(b.id)}>
              <span style={{ fontWeight: 700 }}>{vendorName(b, suppliers)}</span>
              <span className="muted" style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.job || b.ref || ''}</span>
              <span className="num" style={{ fontWeight: 800 }}>{money(b.total)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A job as a position: materials so far, a 12-week line, and what's still owed on it. */
export function JobRow({ j, onOpen }) {
  const tone = dirClass(j.change);
  return (
    <button className="holding" onClick={() => onOpen(j.job)} style={{ gridTemplateColumns: '40px minmax(0, 1fr) 56px auto', gap: 10 }}>
      <span className="avatar-tile" style={{ background: 'var(--card-2)', color: 'var(--text)' }}><Icon name="bills" size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="holding-name">{j.job}</div>
        <div className="holding-sub num">{j.count} bills · last {dayLabel(j.last).toLowerCase()}{j.owed > 0 ? ` · ${kfmt(j.owed)} owed` : ''}</div>
      </div>
      <Spark values={j.weeks} tone={tone} width={56} />
      <div className="holding-right">
        <span className="holding-amt num">{money0(j.spend)}</span>
        <span className={`pill num ${j.last30 ? tone : 'flat'}`}>{j.last30 ? pct(j.change) : 'quiet'}</span>
      </div>
    </button>
  );
}

// ----- the sheets behind the pills -------------------------------------------

export function GstSheet({ gst, onClose }) {
  return (
    <Sheet title={`GST to claim · ${gst.label}`} onClose={onClose}>
      <div className="num" style={{ fontSize: 44, fontWeight: 800 }}>{gst.estimated ? '≈ ' : ''}{money(gst.amount)}</div>
      <p className="muted" style={{ fontSize: 16 }}>GST on the {gst.count} supplier bill{gst.count === 1 ? '' : 's'} dated this quarter, less GST on credits. Your BAS is due {longDate(gst.lodge)} ({gst.lodgeIn} days).</p>
      {gst.estimated > 0 && (
        <div className="card" style={{ background: 'var(--bg)', boxShadow: 'none' }}>
          <div style={{ fontWeight: 700 }}>{gst.estimated} of these are estimates</div>
          <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>They were typed in without the GST, so Watchdog used a tenth of the pre-GST amount. Bills read from a photo or email use the GST printed on them.</p>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13 }}>A guide for your bookkeeper, not tax advice. Only bills in Watchdog count.</p>
    </Sheet>
  );
}

export function EomSheet({ eom, onClose }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return (
    <Sheet title="The end-of-month cut-off" onClose={onClose}>
      <div className="num" style={{ fontSize: 44, fontWeight: 800 }}>{eom.daysLeft} day{eom.daysLeft === 1 ? '' : 's'}</div>
      <p className="muted" style={{ fontSize: 16 }}>until the month rolls over for {eom.suppliers.join(', ')}.</p>
      <div className="card" style={{ background: 'var(--bg)', boxShadow: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Buy today</span><b className="num">{eom.creditToday} days to pay</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Buy on {longDate(first)}</span><b className="num down">{eom.creditFirst} days to pay</b></div>
      </div>
      <p className="muted" style={{ fontSize: 15 }}>On EOM terms the bill is due after the end of the month it's dated in. A big order that can wait until the 1st gets about {eom.extraDays + 30} more days of free credit than one dated on the last day of the month.</p>
    </Sheet>
  );
}

export function YearSheet({ year, record, back, caught, onClose }) {
  const rows = [
    ['Spent with suppliers', money0(year.spend), `${money0(year.perWeek)} a week · ${year.count} bills`],
    year.top && ['Top supplier', year.top.name, `${money0(year.top.spend)} · ${year.top.share.toFixed(0)}% of spend`],
    year.busiest && ['Busiest month', year.busiest.label, `${money0(year.busiest.spend)} of bills`],
    year.biggest && ['Biggest bill', money0(year.biggest.total), `${year.biggest.name}${year.biggest.ref ? ` · ${year.biggest.ref}` : ''}`],
    record.onTimePct != null && ['Paid on time', `${record.onTimePct}%`, `${record.paidCount} account bills`],
    ['Money back', money0(back.credits), `${back.count} credit${back.count === 1 ? '' : 's'} from returns`],
    caught > 0 && ['Watchdog caught', money0(caught), 'Overcharges you can still dispute'],
  ].filter(Boolean);
  return (
    <Sheet title="Your last 12 months" onClose={onClose}>
      <div className="year">
        {rows.map(([k, v, s]) => (
          <div key={k} className="year-row">
            <span className="stat-k">{k}</span>
            <span className="year-v num">{v}</span>
            <span className="muted" style={{ fontSize: 14 }}>{s}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Across {year.suppliers} suppliers. Only bills in Watchdog count.</p>
    </Sheet>
  );
}

/** "Based on 214 bills" — so nobody trusts a number built on half the bills. */
export const basedOn = (n) => `Based on ${n.toLocaleString('en-AU')} bill${n === 1 ? '' : 's'} in Watchdog`;
