import { useState } from 'react';
import { Donut, Gauge, MonthBars, StepChart } from '../components/Charts.jsx';
import { dayLabel, dirClass, kfmt, money, money0, monthName, pct } from '../lib/format.js';
import { shockTone } from '../lib/insights.js';
import { vendorName } from '../lib/store.js';

const PERIODS = { '1M': 31, '3M': 92, '6M': 183, '1Y': 365 };
const PERIOD_NAME = { '1M': 'past month', '3M': 'past 3 months', '6M': 'past 6 months', '1Y': 'past year' };
const VIEWS = [['owed', 'Owed'], ['monthly', 'Monthly'], ['mix', 'Mix'], ['shock', 'Shock']];

export default function Market({ data, ins, onConfirm, onOpenSupplier, onTab, onAccount }) {
  const [view, setView] = useState('owed');
  const [period, setPeriod] = useState('3M');
  const [scrub, setScrub] = useState(null);
  const [month, setMonth] = useState(ins.months.length - 1);
  const name = (b) => vendorName(b, data.suppliers);

  const past = ins.history.slice(-(PERIODS[period] + 1));
  const pastValues = past.map((d) => d.owed);
  const aheadValues = ins.ahead.map((d) => d.owed);
  const sh = ins.shock;
  const incoming = data.queue[0];

  let hero;
  if (view === 'owed') {
    if (!scrub) {
      const diff = ins.owed - pastValues[0];
      const p = (diff / (pastValues[0] || 1)) * 100;
      hero = { label: 'Owed to suppliers', value: money(ins.owed), cls: dirClass(p),
        change: `${diff >= 0 ? '▲' : '▼'} ${money0(Math.abs(diff))} (${Math.abs(p).toFixed(1)}%) ${PERIOD_NAME[period]}` };
    } else if (scrub.kind === 'past') {
      const d = past[scrub.index];
      const bits = [];
      if (d.ins.length) bits.push(`+${money0(sum(d.ins))} ${unique(d.ins.map(name)).join(', ')}`);
      if (d.outs.length) bits.push(`−${money0(sum(d.outs))} paid`);
      hero = { label: dayLabel(d.day), value: money(d.owed), cls: 'flat', change: bits.join(' · ') || 'No bills that day' };
    } else {
      const d = ins.ahead[scrub.index];
      hero = { label: `Still owed after ${dayLabel(d.day)}`, value: money(d.owed), cls: d.due.length ? 'up' : 'flat',
        change: d.due.length ? `−${money0(sum(d.due))} due · ${unique(d.due.map(name)).join(', ')}` : 'Nothing due that day' };
    }
  } else if (view === 'monthly') {
    const m = ins.months[month];
    if (m.current) {
      const p = ((ins.forecast - ins.avgMonth) / ins.avgMonth) * 100;
      hero = { label: `Billed in ${monthName(m.month)} so far`, value: money0(m.total), cls: dirClass(p), change: `Heading for ${kfmt(ins.forecast)} · ${pct(p)} vs average` };
    } else {
      const p = ((m.total - ins.avgMonth) / ins.avgMonth) * 100;
      hero = { label: `Billed in ${monthName(m.month)}`, value: money0(m.total), cls: dirClass(p), change: `${pct(p)} vs average` };
    }
  } else if (view === 'mix') {
    const top = ins.ranked[0];
    hero = { label: 'Spend · last 90 days', value: money0(ins.total90), cls: 'flat', change: `${top.name} takes ${top.share.toFixed(0)}%` };
  } else {
    hero = { label: 'Bill shock', value: `${sh.score} / 100`, valueTone: shockTone(sh.score), cls: 'flat',
      change: `Next 30 days is ${Math.abs(Math.round((sh.ratio - 1) * 100))}% ${sh.ratio >= 1 ? 'above' : 'below'} normal` };
  }

  const stats = [
    { k: 'Bill shock', v: `${sh.score} · ${sh.label}`, tone: shockTone(sh.score), tap: () => setView('shock') },
    { k: 'Due next 7 days', v: money0(ins.next7), tap: () => onTab('bills') },
    { k: 'Overdue', v: money0(ins.overdue), tone: ins.overdue > 0 ? 'up' : null, tap: () => onTab('bills') },
    { k: 'Month forecast', v: kfmt(ins.forecast), tap: () => { setView('monthly'); setMonth(ins.months.length - 1); } },
    { k: 'Top riser', v: `${ins.riser.name} ${pct(ins.riser.change)}`, tap: () => onOpenSupplier(ins.riser.id) },
    { k: 'Top faller', v: `${ins.faller.name} ${pct(ins.faller.change)}`, tap: () => onOpenSupplier(ins.faller.id) },
  ];

  return (
    <div>
      <div className="topbar">
        <div className="brand"><span className="brand-dot" />Watchdog</div>
        <button className="avatar" aria-label="Account" onClick={onAccount}>{data.business.initials}</button>
      </div>

      {incoming && (
        <div className="incoming">
          <span className="incoming-dot" />
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>
            New bill · <span style={{ color: 'var(--text)' }}>{name(incoming)}</span> <span className="num" style={{ color: 'var(--text)' }}>{money(incoming.total)}</span>
          </div>
          <button className="btn-sm" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }} onClick={() => onConfirm(incoming)}>Confirm</button>
        </div>
      )}

      <div className="hero" aria-live="polite">
        <div className="hero-label">{hero.label}</div>
        <div className="hero-value num" style={hero.valueTone ? { color: `var(--${hero.valueTone})` } : null}>{hero.value}</div>
        <div className={`hero-change num ${hero.cls}`}>{hero.change}</div>
      </div>

      {view === 'owed' && <StepChart past={pastValues} ahead={aheadValues} scrub={scrub} onScrub={setScrub} />}
      {view === 'monthly' && (
        <MonthBars selected={month} onSelect={setMonth} ghost={ins.forecast}
          rows={ins.months.map((m) => ({ label: monthName(m.month), value: m.total, current: m.current }))} />
      )}
      {view === 'mix' && <Donut rows={ins.ranked.map((s) => ({ name: s.name, share: s.share }))} />}
      {view === 'shock' && <Gauge score={sh.score} label={sh.label} tone={shockTone(sh.score)} caption={`Normal 30 days ${kfmt(sh.normal)} · coming ${kfmt(sh.next30)}`} />}

      <div className="views" role="tablist" aria-label="Chart view">
        {VIEWS.map(([k, label]) => (
          <button key={k} role="tab" className="view-tab" aria-selected={view === k} onClick={() => { setView(k); setScrub(null); }}>{label}</button>
        ))}
      </div>
      {view === 'owed' && (
        <div className="periods">
          {Object.keys(PERIODS).map((p) => (
            <button key={p} className="period" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p}</button>
          ))}
          <span style={{ flex: 1 }} />
          <span className="footnote">each step is a bill</span>
        </div>
      )}

      <div style={{ padding: '24px 16px 0' }}>
        <h2 className="section-title" style={{ fontSize: 17, marginBottom: 12 }}>Stats</h2>
        <div className="stats">
          {stats.map((s) => (
            <button key={s.k} className="stat" onClick={s.tap}>
              <div className="stat-k">{s.k}</div>
              <div className="stat-v num" style={s.tone ? { color: `var(--${s.tone})` } : null}>{s.v}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 16px 32px' }}>
        <h2 className="section-title" style={{ fontSize: 17 }}>Suppliers</h2>
        {ins.ranked.map((s) => {
          const max = Math.max(...s.months) || 1;
          return (
            <button key={s.id} className="row" style={{ minHeight: 64 }} onClick={() => onOpenSupplier(s.id)}>
              <div className="row-main">
                <div style={{ fontSize: 15, fontWeight: 500 }}>{s.name}</div>
                <div className="row-sub num">{s.share.toFixed(0)}% of spend</div>
              </div>
              <div className="mini-bars" aria-hidden="true">
                {s.months.map((v, i) => <span key={i} style={{ height: Math.max(2, (v / max) * 24) }} />)}
              </div>
              <div style={{ textAlign: 'right', minWidth: 84 }}>
                <div className="num">{money0(s.spend)}</div>
                <div className={`num ${dirClass(s.change)}`} style={{ fontSize: 12 }}>{pct(s.change)}</div>
              </div>
            </button>
          );
        })}
        <p className="footnote" style={{ textAlign: 'center', marginTop: 16 }}>Early warning, not your books — Xero is the source of truth.</p>
      </div>
    </div>
  );
}

const sum = (l) => l.reduce((t, b) => t + b.total, 0);
const unique = (l) => [...new Set(l)];
