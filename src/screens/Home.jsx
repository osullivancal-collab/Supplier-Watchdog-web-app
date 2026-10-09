import { useState } from 'react';
import { Donut, Gauge, MonthBars, StepChart } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import { HoldingRow } from '../components/Rows.jsx';
import { useCountUp } from '../components/UI.jsx';
import { dateParts, dayLabel, dirClass, kfmt, money, money0, monthName, pct, whenDue } from '../lib/format.js';
import { shockTone } from '../lib/insights.js';
import { vendorName } from '../lib/store.js';

const PERIODS = { '1M': 31, '3M': 92, '6M': 183, '1Y': 365 };
const PERIOD_NAME = { '1M': 'past month', '3M': 'past 3 months', '6M': 'past 6 months', '1Y': 'past year' };
const VIEWS = [['owed', 'Owed'], ['spend', 'Spend'], ['mix', 'Mix'], ['shock', 'Shock']];

export default function Home({ data, ins, go }) {
  const [view, setView] = useState('owed');
  const [period, setPeriod] = useState('3M');
  const [scrub, setScrub] = useState(null);
  const [month, setMonth] = useState(ins.months.length - 1);
  const name = (b) => vendorName(b, data.suppliers);
  const sh = ins.shock;

  const past = ins.history.slice(-(PERIODS[period] + 1));
  const pastValues = past.map((d) => d.owed);
  const incoming = data.queue[0];

  // ----- hero: changes with the view and with your finger on the chart -----
  let hero;
  if (view === 'owed') {
    if (!scrub) {
      const diff = ins.owed - pastValues[0];
      const p = pastValues[0] ? (diff / pastValues[0]) * 100 : 0;
      hero = { label: 'You owe', value: ins.owed, pill: { tone: dirClass(p), text: `${diff >= 0 ? '+' : '−'}${money0(Math.abs(diff))}` }, note: PERIOD_NAME[period] };
    } else if (scrub.kind === 'past') {
      const d = past[scrub.index];
      const what = [d.ins.length && `+${money0(sum(d.ins))} from ${unique(d.ins.map(name)).join(', ')}`, d.outs.length && `−${money0(sum(d.outs))} paid`].filter(Boolean).join(' · ');
      hero = { label: dayLabel(d.day), value: d.owed, note: what || 'No bills that day' };
    } else {
      const d = ins.ahead[scrub.index];
      hero = { label: `Left after ${dayLabel(d.day)}`, value: d.owed,
        pill: d.due.length ? { tone: 'up', text: `−${money0(sum(d.due))}` } : null,
        note: d.due.length ? unique(d.due.map(name)).join(', ') : 'Nothing due' };
    }
  } else if (view === 'spend') {
    const m = ins.months[month];
    const p = ins.avgMonth ? (((m.current ? ins.forecast : m.total) - ins.avgMonth) / ins.avgMonth) * 100 : 0;
    hero = m.current
      ? { label: `${monthName(m.month)} so far`, value: m.total, pill: { tone: dirClass(p), text: pct(p) }, note: `heading for ${kfmt(ins.forecast)}` }
      : { label: `Spent in ${monthName(m.month)}`, value: m.total, pill: { tone: dirClass(p), text: pct(p) }, note: 'vs your average' };
  } else if (view === 'mix') {
    const top = ins.ranked[0];
    hero = { label: 'Spent · last 90 days', value: ins.total90, note: top && top.spend > 0 ? `${top.name} takes ${top.share.toFixed(0)}%` : '' };
  } else {
    const p = Math.round((sh.ratio - 1) * 100);
    hero = { label: 'Bill shock', value: sh.score, isScore: true, pill: { tone: p > 0 ? 'up' : 'down', text: `${p > 0 ? '+' : ''}${p}%` }, note: 'vs a normal month' };
  }
  const shown = useCountUp(hero.value);

  const coming = ins.open.filter((b) => b.due >= 0).slice(0, 6);
  const top = ins.ranked.filter((s) => s.spend > 0).slice(0, 5);

  return (
    <div style={{ position: 'relative' }}>
      <div className="glow" />
      <div className="topbar">
        <div className="brand"><span className="brand-mark"><Icon name="dog" size={17} stroke={2.2} /></span>Watchdog</div>
        <button className="icon-btn" aria-label="Account" onClick={() => go.account()} style={{ fontSize: 14, fontWeight: 700 }}>{data.business.initials}</button>
      </div>

      {incoming && (
        <div className="incoming">
          <span className="ping" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>New bill landed</div>
            <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name(incoming)} <span className="num">{money(incoming.total)}</span></div>
          </div>
          <button className="btn btn-primary" style={{ height: 42, fontSize: 15, borderRadius: 12 }} onClick={() => go.confirm(incoming)}>Confirm</button>
        </div>
      )}

      {ins.empty ? <Welcome go={go} /> : <>
      <div style={{ padding: '6px 16px 0', position: 'relative' }}>
        <div className="seg" role="tablist" aria-label="Chart">
          {VIEWS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setScrub(null); setMonth(ins.months.length - 1); }}>{label}</button>
          ))}
        </div>
      </div>

      <div className="hero" aria-live="polite">
        <div className="hero-label">{hero.label}</div>
        <div className="hero-value num" style={hero.isScore ? { color: shockTone(sh.score) === 'text' ? 'var(--text)' : `var(--${shockTone(sh.score)})` } : null}>
          {hero.isScore ? `${Math.round(shown)}` : money(shown)}{hero.isScore && <span style={{ fontSize: 24, color: 'var(--muted)' }}> /100</span>}
        </div>
        <div className="hero-change">
          {hero.pill && <span className={`pill num ${hero.pill.tone}`}>{hero.pill.text}</span>}
          <span className="muted">{hero.note}</span>
        </div>
      </div>

      {view === 'owed' && (
        <>
          <StepChart past={pastValues} ahead={ins.ahead.map((d) => d.owed)} scrub={scrub} onScrub={setScrub} />
          <div className="periods">
            {Object.keys(PERIODS).map((p) => <button key={p} className="period" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p}</button>)}
          </div>
        </>
      )}
      {view === 'spend' && <MonthBars selected={month} onSelect={setMonth} ghost={ins.forecast} rows={ins.months.map((m) => ({ label: monthName(m.month), value: m.total, current: m.current }))} />}
      {view === 'mix' && <Donut rows={ins.ranked.filter((s) => s.spend > 0).map((s) => ({ name: s.name, share: s.share }))} />}
      {view === 'shock' && <Gauge score={sh.score} label={sh.label} tone={shockTone(sh.score)} caption={`Normal month ${kfmt(sh.normal)} · next 30 days ${kfmt(sh.next30)}`} />}

      <div className="page" style={{ paddingTop: 28 }}>
        <div className="tiles">
          <button className="tile" onClick={() => setView('shock')}>
            <span className="tile-k">Bill shock</span>
            <span className={`tile-v num ${shockTone(sh.score) === 'text' ? '' : shockTone(sh.score)}`}>{sh.score}</span>
            <span className={`tile-sub ${shockTone(sh.score) === 'text' ? 'muted' : shockTone(sh.score)}`}>{sh.label}</span>
          </button>
          <button className="tile" onClick={() => go.tab('bills')}>
            <span className="tile-k">Overdue</span>
            <span className={`tile-v num ${ins.overdue > 0 ? 'up' : ''}`}>{money0(ins.overdue)}</span>
            <span className="tile-sub muted">{ins.overdue > 0 ? `${ins.open.filter((b) => b.due < 0).length} bill${ins.open.filter((b) => b.due < 0).length === 1 ? '' : 's'}` : 'All clear'}</span>
          </button>
          <button className="tile" onClick={() => go.tab('bills')}>
            <span className="tile-k">Next 7 days</span>
            <span className="tile-v num">{money0(ins.next7)}</span>
            <span className="tile-sub muted">{ins.open.filter((b) => b.due <= 6).length} to pay</span>
          </button>
          <button className="tile" onClick={() => setView('spend')}>
            <span className="tile-k">This month</span>
            <span className="tile-v num">{kfmt(ins.forecast)}</span>
            <span className={`tile-sub ${dirClass(ins.forecast - ins.avgMonth)}`}>{ins.avgMonth ? pct(((ins.forecast - ins.avgMonth) / ins.avgMonth) * 100) : '—'} forecast</span>
          </button>
        </div>

        {coming.length > 0 && (
          <section>
            <div className="section-head"><h2 className="h2">Coming up</h2><button className="link" onClick={() => go.tab('bills')}>All bills</button></div>
            <div className="coming">
              {coming.map((b) => {
                const d = dateParts(b.due);
                return (
                  <button key={b.id} className="coming-card" onClick={() => go.bill(b.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="date-tile" style={{ width: 42, height: 46 }}><b className="num" style={{ fontSize: 17 }}>{d.day}</b><span>{d.mon}</span></div>
                      <div style={{ fontWeight: 700, fontSize: 15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(b)}</div>
                    </div>
                    <div>
                      <div className="coming-amt num">{money0(b.total)}</div>
                      <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{whenDue(b.due)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="section-head"><h2 className="h2">Your suppliers</h2><button className="link" onClick={() => go.tab('suppliers')}>See all</button></div>
          <div className="card" style={{ padding: '4px 16px' }}>
            {top.map((s) => <HoldingRow key={s.id} s={s} onOpen={go.supplier} />)}
            {top.length === 0 && <p className="muted" style={{ padding: '18px 0' }}>No supplier bills in the last 90 days.</p>}
          </div>
        </section>

        <div className="tiles">
          <button className="tile card-tap" onClick={() => go.tryPurchase()}>
            <span className="action-icon" style={{ width: 40, height: 40 }}><Icon name="calc" size={20} /></span>
            <span><span style={{ display: 'block', fontWeight: 800, fontSize: 17 }}>Try a buy</span><span className="muted" style={{ fontSize: 13 }}>See it before you sign</span></span>
          </button>
          <button className="tile card-tap" onClick={() => go.counter()}>
            <span className="action-icon" style={{ width: 40, height: 40 }}><Icon name="handshake" size={20} /></span>
            <span><span style={{ display: 'block', fontWeight: 800, fontSize: 17 }}>Counter mode</span><span className="muted" style={{ fontSize: 13 }}>Bargain on the spot</span></span>
          </button>
        </div>
      </div>
      </>}
    </div>
  );
}

function Welcome({ go }) {
  const steps = [
    ['camera', 'Snap your next docket', 'Photo + amount. Ten seconds at the counter.', () => go.addBill(null, { photo: true })],
    ['store', 'Add your suppliers', 'Reece, Middys, whoever bills you.', () => go.addSupplier()],
    ['bill', 'Add what you owe now', 'Your open bills — the chart builds from here.', () => go.addBill()],
  ];
  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <div>
        <h1 className="title" style={{ fontSize: 34 }}>Treat your suppliers like a portfolio.</h1>
        <p className="muted" style={{ fontSize: 17, marginTop: 10 }}>See every bill coming before it hits, who's taking your money, and when to bargain.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map(([icon, title, sub, fn]) => (
          <button key={title} className="action" style={{ background: 'var(--card)' }} onClick={fn}>
            <span className="action-icon"><Icon name={icon} size={22} /></span>
            <span style={{ flex: 1 }}><span className="action-title" style={{ display: 'block' }}>{title}</span><span className="action-sub">{sub}</span></span>
            <Icon name="chevron" size={20} style={{ color: 'var(--muted)' }} />
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 15 }}>Coming soon: forward supplier emails and bills add themselves.</p>
    </div>
  );
}

const sum = (l) => l.reduce((t, b) => t + b.total, 0);
const unique = (l) => [...new Set(l)];
