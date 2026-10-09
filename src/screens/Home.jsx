import { useMemo, useState } from 'react';
import { DotChart } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import { HoldingRow } from '../components/Rows.jsx';
import { useCountUp } from '../components/UI.jsx';
import { bucketDescriber, greeting } from '../lib/buckets.js';
import { dateParts, kfmt, money, money0, todayLabel, whenDue } from '../lib/format.js';
import { catches as findCatches, spendBuckets } from '../lib/model.js';
import { daysLeft } from '../lib/backend.js';
import { vendorName } from '../lib/store.js';

const RANGES = ['1M', '3M', '6M', '1Y'];

export default function Home({ data, ins, go, account = null }) {
  const [range, setRange] = useState('3M');
  const nameOf = (id) => data.suppliers.find((s) => s.id === id)?.name || id || 'Other';
  const name = (b) => vendorName(b, data.suppliers);
  const buckets = useMemo(() => spendBuckets(data.bills, range), [data.bills, range]);
  const caught = useMemo(() => findCatches(data).filter((c) => !data.disputes[c.id]), [data]);
  const owed = useCountUp(ins.owed);
  const sh = ins.shock;
  const incoming = data.queue[0];
  const coming = ins.open.filter((b) => b.due >= 0).slice(0, 6);
  const top = ins.ranked.filter((s) => s.spend > 0).slice(0, 4);
  const overdueCount = ins.open.filter((b) => b.due < 0).length;
  const now = new Date();

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
        <div className="page" style={{ paddingTop: 10, gap: 16 }}>
          {incoming && (
            <div className="incoming" style={{ margin: 0 }}>
              <span className="ping" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>New bill landed</div>
                <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name(incoming)} <span className="num">{money(incoming.total)}</span></div>
              </div>
              <button className="btn btn-primary" style={{ height: 42, fontSize: 15, borderRadius: 12 }} onClick={() => go.confirm(incoming)}>Confirm</button>
            </div>
          )}

          <section className="hero-card" aria-label="What you owe">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="k">You owe suppliers</div>
                <div className="v num">{money(owed)}</div>
              </div>
              <button onClick={() => go.tab('bills')} style={{ textAlign: 'right', color: 'inherit', paddingTop: 4 }} aria-label={`Bill shock ${sh.score}, ${sh.label}`}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: 'var(--hero-muted)' }}>BILL SHOCK</div>
                <div className="num" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: sh.score >= 60 ? 'var(--hero-warn)' : 'var(--hero-text)' }}>{sh.score}</div>
                <div className={`shock-segs ${sh.score >= 60 ? 'hot' : ''}`}>{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < Math.ceil(sh.score / 20) ? 'on' : ''} />)}</div>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="hero-chip num">{kfmt(ins.next7)} due this week</span>
              {ins.overdue > 0 && <span className="hero-chip warn num">{kfmt(ins.overdue)} overdue</span>}
              <span className="hero-chip">{sh.label} month ahead</span>
            </div>
          </section>

          <section className="card" aria-label="Spending">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h2 className="h2">Spending</h2>
              {buckets.streak >= 2
                ? <span className="tag down"><Icon name="flame" size={14} stroke={2.4} style={{ marginRight: 5 }} />{buckets.streak} {buckets.unit}s under avg</span>
                : <span className="tag up"><Icon name="flame" size={14} stroke={2.4} style={{ marginRight: 5 }} />Last {buckets.unit} over avg</span>}
            </div>
            <div className="seg" role="tablist" aria-label="Range" style={{ marginTop: 14 }}>
              {RANGES.map((r) => <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}>{r}</button>)}
            </div>
            <div style={{ marginTop: 12 }}>
              <DotChart key={range} data={buckets} describe={bucketDescriber(buckets.unit, nameOf)} />
            </div>
          </section>

          {caught.length > 0 && (
            <section className="card" aria-label="Watchdog caught">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <h2 className="h2">Watchdog caught</h2>
                <span className="num down" style={{ fontSize: 24, fontWeight: 800 }}>{money0(caught.reduce((t, c) => t + c.amount, 0))}</span>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>on your own bills, this quarter</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {caught.slice(0, 3).map((c) => <CatchRow key={c.id} c={c} nameOf={nameOf} onDispute={() => go.dispute(c)} />)}
              </div>
            </section>
          )}

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
              {top.map((s, i) => <HoldingRow key={s.id} s={s} index={i} onOpen={go.supplier} />)}
              {top.length === 0 && <p className="muted" style={{ padding: '18px 0' }}>No supplier bills in the last 90 days.</p>}
            </div>
          </section>

          <div className="tiles">
            <button className="tile card-tap" onClick={() => go.tryPurchase()}>
              <span className="action-icon" style={{ width: 42, height: 42, background: 'var(--card-2)' }}><Icon name="calc" size={20} /></span>
              <span><span style={{ display: 'block', fontWeight: 800, fontSize: 17 }}>Try a buy</span><span className="muted" style={{ fontSize: 13 }}>See it before you sign</span></span>
            </button>
            <button className="tile card-tap" onClick={() => go.counter()}>
              <span className="action-icon" style={{ width: 42, height: 42, background: 'var(--card-2)' }}><Icon name="handshake" size={20} /></span>
              <span><span style={{ display: 'block', fontWeight: 800, fontSize: 17 }}>Counter mode</span><span className="muted" style={{ fontSize: 13 }}>Bargain on the spot</span></span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CatchRow({ c, nameOf, onDispute }) {
  const price = c.kind === 'price';
  return (
    <div className="catch">
      <span className="catch-icon" style={{ background: price ? 'var(--up-soft)' : 'var(--due-soft)', color: price ? 'var(--up)' : 'var(--due)' }}>
        <Icon name={price ? 'tag' : 'copy'} size={20} stroke={2.2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {price ? `${nameOf(c.supplierId)}: ${c.item.name.split(' · ')[0]}` : `${nameOf(c.supplierId)} billed twice?`}
        </div>
        <div className="muted num" style={{ fontSize: 13 }}>
          {price
            ? `${money(c.mine)} vs ${money(c.best)} at ${nameOf(c.bestId)} · ${money0(c.amount)}/qtr`
            : `${c.b.ref || 'Bill'} matches ${c.a.ref || 'an earlier bill'} · ${money0(c.amount)}`}
        </div>
      </div>
      <button className="btn btn-primary" style={{ height: 40, fontSize: 14, padding: '0 12px', borderRadius: 10 }} onClick={onDispute}>Dispute</button>
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
