import { useMemo, useState } from 'react';
import { DotChart, Donut, Gauge, StepChart } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import { Heatmap, StatPills, Ticker, basedOn } from '../components/Portfolio.jsx';
import { HoldingRow } from '../components/Rows.jsx';
import { creditLine } from '../lib/portfolio.js';
import { useCountUp } from '../components/UI.jsx';
import { bucketDescriber, greeting } from '../lib/buckets.js';
import { dayLabel, dirClass, kfmt, money, money0, pct, todayLabel, whenDue } from '../lib/format.js';
import { shockTone } from '../lib/insights.js';
import { catches as findCatches, spendBuckets } from '../lib/model.js';
import { daysLeft } from '../lib/backend.js';
import { vendorName } from '../lib/store.js';

const RANGES = ['1M', '3M', '6M', '1Y'];

const VIEWS = [['owed', 'Owed'], ['spend', 'Spend'], ['mix', 'Mix'], ['shock', 'Shock']];
const OWED_DAYS = { '1M': 31, '3M': 92, '6M': 183, '1Y': 365 };
const PERIOD_NAME = { '1M': 'in a month', '3M': 'in 3 months', '6M': 'in 6 months', '1Y': 'in a year' };
const sum = (bs) => bs.reduce((t, b) => t + b.total, 0);
const unique = (xs) => [...new Set(xs)];

export default function Home({ data, ins, go, account = null }) {
  const [view, setView] = useState('owed');
  const [range, setRange] = useState('3M');
  const [scrub, setScrub] = useState(null);
  const nameOf = (id) => data.suppliers.find((s) => s.id === id)?.name || id || 'Other';
  const name = (b) => vendorName(b, data.suppliers);
  const buckets = useMemo(() => spendBuckets(data.bills, range), [data.bills, range]);
  const caught = useMemo(() => findCatches(data).filter((c) => !data.disputes[c.id]), [data]);
  const sh = ins.shock;
  const now = new Date();

  // ----- the number at the top follows the view, and your finger on the chart -----
  const past = ins.history.slice(-(OWED_DAYS[range] + 1)).map((d) => d.owed);
  let hero = null;
  if (view === 'owed') {
    if (!scrub) {
      const diff = ins.owed - past[0];
      hero = { label: 'You owe suppliers', value: ins.owed, pill: { tone: dirClass(diff), text: `${diff >= 0 ? '+' : '−'}${money0(Math.abs(diff))}` }, note: PERIOD_NAME[range] };
    } else if (scrub.kind === 'past') {
      const d = ins.history.slice(-(OWED_DAYS[range] + 1))[scrub.index];
      const what = [d.ins.length && `+${money0(sum(d.ins))} ${unique(d.ins.map(name)).join(', ')}`, d.outs.length && `−${money0(sum(d.outs))} paid`].filter(Boolean).join(' · ');
      hero = { label: `Owed ${dayLabel(d.day)}`, value: d.owed, note: what || 'No bills that day' };
    } else {
      const d = ins.ahead[scrub.index];
      hero = { label: `Left after ${dayLabel(d.day)}`, value: d.owed, pill: d.due.length ? { tone: 'up', text: `−${money0(sum(d.due))}` } : null, note: d.due.length ? unique(d.due.map(name)).join(', ') : 'Nothing due' };
    }
  } else if (view === 'mix') {
    const lead = ins.ranked[0];
    hero = { label: 'Spent · last 90 days', value: ins.total90, note: lead && lead.spend > 0 ? `${lead.name} takes ${lead.share.toFixed(0)}%` : '' };
  } else if (view === 'shock') {
    const p = Math.round((sh.ratio - 1) * 100);
    hero = { label: 'Bill shock · next 30 days', value: sh.score, score: true, pill: { tone: p > 0 ? 'up' : 'down', text: `${p > 0 ? '+' : ''}${p}%` }, note: 'vs a normal month' };
  }
  const shown = useCountUp(hero?.value ?? 0);
  const pick = (v) => { setView(v); setScrub(null); };

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon name="eye" size={20} stroke={2.2} /></span>
          <span>
            <span style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>Watchdog</span>
            <span className="muted" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginTop: 3 }}>{greeting(now)}{data.business.owner ? `, ${data.business.owner.split(' ')[0]}` : ''} · {todayLabel(now)}</span>
          </span>
        </div>
        <button className="icon-btn" aria-label="Account" onClick={() => go.account()} style={{ fontSize: 14, fontWeight: 700, background: 'var(--card)', border: '1px solid var(--line)' }}>{data.business.initials}</button>
      </div>

      <TrialBanner access={account?.access} go={go} />
      {ins.empty ? <Welcome go={go} /> : (
        <div className="page" style={{ paddingTop: 4, gap: 18 }}>
          <Ticker ranked={ins.ranked} onOpen={go.supplier} />
          <section className="market" aria-label="Your supplier spend">
            <div className="seg" role="tablist" aria-label="Chart view">
              {VIEWS.map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => pick(k)}>{l}</button>)}
            </div>

            {hero && (
              <div className="market-readout" aria-live="polite">
                <div className="market-label">{hero.label}</div>
                <div className="market-value num" style={hero.score && sh.score >= 60 ? { color: 'var(--up)' } : null}>
                  {hero.score ? Math.round(shown) : money(shown)}{hero.score && <span className="market-of"> /100</span>}
                </div>
                <div className="market-change">
                  {hero.pill && <span className={`pill num ${hero.pill.tone}`}>{hero.pill.text}</span>}
                  <span>{hero.note}</span>
                </div>
              </div>
            )}

            {view === 'owed' && <StepChart key={range} past={past} ahead={ins.ahead.map((d) => d.owed)} scrub={scrub} onScrub={setScrub} />}
            {view === 'spend' && <div style={{ marginTop: 14 }}><DotChart key={range} data={buckets} describe={bucketDescriber(buckets.unit, nameOf)} /></div>}
            {view === 'mix' && <Donut rows={ins.ranked.filter((s) => s.spend > 0).map((s) => ({ name: s.name, share: s.share }))} />}
            {view === 'shock' && <Gauge score={sh.score} label={sh.label} tone={shockTone(sh.score)} caption={`Normal month ${kfmt(sh.normal)} · next 30 days ${kfmt(sh.next30)}`} />}

            {(view === 'owed' || view === 'spend') && (
              <div className="periods" role="group" aria-label="Range">
                {RANGES.map((r) => <button key={r} className="period" aria-pressed={range === r} onClick={() => { setRange(r); setScrub(null); }}>{r}</button>)}
              </div>
            )}
            {view === 'mix' && <button className="link" onClick={() => go.tab('suppliers')}>See every supplier</button>}
            {view === 'shock' && <p className="market-help">How much is falling due in the next 30 days compared with a normal month. Over 60 means a heavy month is coming.</p>}
          </section>

          <StatPills pills={pills(ins, go)} />
          <div className="based">{basedOn(ins.billCount)}</div>

          <NeedsYou data={data} ins={ins} go={go} caught={caught} name={name} />

          <section aria-label="Where your money goes">
            <div className="section-head"><h2 className="h2">Where your money goes</h2><button className="link" onClick={() => go.tab('suppliers')}>Market</button></div>
            <Heatmap ranked={ins.ranked} onOpen={go.supplier} />
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Size is the last 90 days' spend. Red is paying more than the 90 days before, green is paying less. Tap one to open it.</p>
          </section>

          <section aria-label="Your suppliers">
            <div className="section-head"><h2 className="h2">Your suppliers</h2><button className="link" onClick={() => go.tab('suppliers')}>See all</button></div>
            <div className="card" style={{ padding: '4px 16px' }}>
              {ins.ranked.filter((x) => x.spend > 0).slice(0, 4).map((x, i) => <HoldingRow key={x.id} s={x} index={i} onOpen={go.supplier} credit={ins.credit.find((c) => c.id === x.id)} />)}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** The stat cards under the chart, like the stats row under a share price. */
function pills(ins, go) {
  const { riser, faller, gst, eom, record, back, year } = ins;
  const lead = ins.ranked.find((s) => s.spend > 0);
  return [
    riser && { key: 'riser', label: 'Top riser', value: riser.name, tone: null, sub: `${pct(riser.change)} on 90 days`, subTone: 'up', onClick: () => go.supplier(riser.id) },
    faller && { key: 'faller', label: 'Top faller', value: faller.name, sub: `${pct(faller.change)} on 90 days`, subTone: 'down', onClick: () => go.supplier(faller.id) },
    lead && { key: 'lead', label: 'Biggest holding', value: lead.name, sub: `${lead.share.toFixed(0)}% of spend`, onClick: () => go.supplier(lead.id) },
    ins.credit[0] && { key: 'credit', label: 'Credit used', value: `${ins.credit[0].usedPct}%`, tone: ins.credit[0].status === 'ok' ? null : ins.credit[0].status === 'over' ? 'up' : null,
      sub: `${ins.credit[0].name} · ${money0(Math.max(0, ins.credit[0].left))} left`, subTone: ins.credit[0].status === 'ok' ? null : 'due', onClick: () => go.supplier(ins.credit[0].id) },
    gst.count > 0 && { key: 'gst', label: 'GST to claim', value: `${gst.estimated ? '≈' : ''}${money0(gst.amount)}`, tone: 'down', sub: `${gst.label} · BAS in ${gst.lodgeIn}d`, onClick: () => go.gst() },
    eom.suppliers.length > 0 && { key: 'eom', label: 'EOM cut-off', value: `${eom.daysLeft} day${eom.daysLeft === 1 ? '' : 's'}`, sub: `Buy on the 1st: +${eom.creditFirst - eom.creditToday} days`, subTone: 'due', onClick: () => go.eom() },
    record.onTimePct != null && { key: 'record', label: 'Paid on time', value: `${record.onTimePct}%`, tone: record.onTimePct >= 90 ? 'down' : record.onTimePct < 70 ? 'up' : null, sub: record.streak ? `${record.streak} in a row` : `${record.lateCount} late`, onClick: () => go.tab('deals') },
    back.count > 0 && { key: 'back', label: 'Money back', value: money0(back.credits), tone: 'down', sub: back.unused ? `${money0(back.unused)} credit unused` : `${back.count} credit${back.count === 1 ? '' : 's'} this year`, subTone: back.unused ? 'due' : null, onClick: () => go.tab('deals') },
    year.spend > 0 && { key: 'year', label: 'Last 12 months', value: kfmt(year.spend), sub: `${money0(year.perWeek)} a week`, onClick: () => go.year() },
  ];
}

/**
 * Everything that wants a tap from you, in one short list, most urgent first:
 * new bills to confirm, overdue bills, what Watchdog caught, what's due this week.
 * Several of a kind collapse into one row so the list stays short.
 */
function NeedsYou({ data, ins, go, caught, name }) {
  const rows = [];
  if (data.queue.length > 2) {
    rows.push({ key: 'new', icon: 'bill', tone: 'due', title: `${data.queue.length} new bills to check`, sub: `${money0(sum(data.queue))} · ${unique(data.queue.map(name)).join(', ')}`, action: ['Check', () => go.tab('bills')] });
  } else {
    for (const q of data.queue) {
      rows.push({ key: `q${q.id}`, icon: 'bill', tone: 'due', title: `New bill · ${name(q)} ${money(q.total)}`, sub: q.flag ? q.flag.text : `Due ${dayLabel(q.due)} — is it right?`,
        action: ['Confirm', () => go.confirm(q)], open: () => go.bill(q.id, q) });
    }
  }
  for (const b of ins.open.filter((x) => x.total > 0 && x.due < 0)) {
    rows.push({ key: `o${b.id}`, icon: 'bell', tone: 'up', title: `Overdue · ${name(b)}`, sub: `${whenDue(b.due)}${b.ref ? ` · ${b.ref}` : ''}`, amount: money(b.total), amountTone: 'up', open: () => go.bill(b.id) });
  }
  for (const c of ins.credit.filter((x) => x.status !== 'ok')) {
    rows.push({ key: `credit${c.id}`, icon: 'bolt', tone: c.status === 'over' ? 'up' : 'due', title: `${c.name} at ${c.usedPct}% of credit limit`, sub: creditLine(c), open: () => go.supplier(c.id) });
  }
  if (caught.length) {
    const total = caught.reduce((t, c) => t + c.amount, 0);
    rows.push({ key: 'caught', icon: 'eye', tone: 'down', title: `Watchdog caught ${money0(total)}`, sub: `${caught.length} overcharge${caught.length === 1 ? '' : 's'} you can push back on`, action: ['See them', () => go.caught()] });
  }
  const soon = ins.open.filter((b) => b.total > 0 && b.due >= 0 && b.due <= 6);
  if (soon.length) {
    rows.push({ key: 'soon', icon: 'bills', tone: null, title: `${soon.length} bill${soon.length === 1 ? '' : 's'} due this week`, sub: `Next: ${name(soon[0])} ${whenDue(soon[0].due).toLowerCase()}`, amount: money0(sum(soon)), open: () => go.tab('bills') });
  }
  return (
    <section aria-label="Needs you">
      <div className="section-head">
        <h2 className="h2">Needs you</h2>
        <button className="link" onClick={() => go.tab('bills')}>All bills</button>
      </div>
      <div className="card" style={{ padding: '4px 0' }}>
        {rows.length === 0 && <p className="muted" style={{ padding: '18px 16px' }}>All clear. Nothing new, nothing overdue, nothing due this week.</p>}
        {rows.map((r) => (
          <div key={r.key} className="todo">
            <button className="todo-main" onClick={r.open || r.action?.[1]}>
              <span className="todo-icon" style={r.tone ? { background: `var(--${r.tone}-soft)`, color: `var(--${r.tone})` } : null}><Icon name={r.icon} size={19} stroke={2.2} /></span>
              <span className="todo-text">
                <span className="todo-title">{r.title}</span>
                <span className="todo-sub">{r.sub}</span>
              </span>
              {r.amount && !r.action && <span className={`todo-amt num ${r.amountTone || ''}`}>{r.amount}</span>}
              {!r.action && <Icon name="chevron" size={18} style={{ color: 'var(--muted)', flex: 'none' }} />}
            </button>
            {r.action && <button className="btn btn-primary todo-btn" onClick={r.action[1]}>{r.action[0]}</button>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The list behind "Watchdog caught": each overcharge, with a ready-made dispute. */
export function CaughtList({ data, onDispute }) {
  const nameOf = (id) => data.suppliers.find((s) => s.id === id)?.name || id || 'Other';
  const caught = findCatches(data).filter((c) => !data.disputes[c.id]);
  if (!caught.length) return <p className="muted">Nothing left to dispute. Watchdog keeps checking every new bill.</p>;
  return caught.map((c) => {
    const price = c.kind === 'price';
    return (
      <div key={c.id} className="catch">
        <span className="catch-icon" style={{ background: price ? 'var(--up-soft)' : 'var(--due-soft)', color: price ? 'var(--up)' : 'var(--due)' }}>
          <Icon name={price ? 'tag' : 'copy'} size={20} stroke={2.2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{price ? `${nameOf(c.supplierId)}: ${c.item.name.split(' · ')[0]}` : `${nameOf(c.supplierId)} billed twice?`}</div>
          <div className="muted num" style={{ fontSize: 13 }}>
            {price ? `${money(c.mine)} vs ${money(c.best)} at ${nameOf(c.bestId)} · ${money0(c.amount)}/qtr` : `${c.b.ref || 'Bill'} matches ${c.a.ref || 'an earlier bill'} · ${money0(c.amount)}`}
          </div>
        </div>
        <button className="btn btn-primary" style={{ height: 40, fontSize: 14, padding: '0 12px', borderRadius: 10 }} onClick={() => onDispute(c)}>Dispute</button>
      </div>
    );
  });
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
        <h1 className="title" style={{ fontSize: 36, lineHeight: 1.05 }}>Treat your suppliers like a portfolio.</h1>
        <p className="muted" style={{ fontSize: 17, marginTop: 10 }}>See every bill coming before it hits, who's taking your money, and when to bargain.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map(([icon, title, sub, fn]) => (
          <button key={title} className="action card" style={{ background: 'var(--card)' }} onClick={fn}>
            <span className="action-icon" style={{ background: 'var(--card-2)' }}><Icon name={icon} size={22} /></span>
            <span style={{ flex: 1 }}><span className="action-title" style={{ display: 'block' }}>{title}</span><span className="action-sub">{sub}</span></span>
            <Icon name="chevron" size={20} style={{ color: 'var(--muted)' }} />
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 15 }}>Coming soon: forward supplier emails and bills add themselves.</p>
    </div>
  );
}

function TrialBanner({ access, go }) {
  if (!access || access.subscription_status === 'grandfathered') return null;
  const left = daysLeft(access.trial_ends_at);
  const late = access.subscription_status === 'past_due' || access.subscription_status === 'unpaid';
  let text = null;
  if (late) text = 'Your last payment didn’t go through. Fix it to keep adding bills.';
  else if (!access.has_access) text = 'Your free trial has ended. Your bills are safe; subscribe to keep adding.';
  else if (access.trial_active && left <= 3) text = `${left} day${left === 1 ? '' : 's'} left on your free trial.`;
  if (!text) return null;
  return (
    <div className="page" style={{ paddingTop: 10, paddingBottom: 0 }}>
      <button className="incoming" style={{ margin: 0, textAlign: 'left', width: '100%' }} onClick={() => go.account()}>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{text}</span>
        <span className="btn btn-primary" style={{ height: 40, fontSize: 14, borderRadius: 10 }}>{late ? 'Fix' : 'Subscribe'}</span>
      </button>
    </div>
  );
}
