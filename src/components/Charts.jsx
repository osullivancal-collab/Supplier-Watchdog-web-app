import { useId, useRef, useState } from 'react';

const W = 1000, H = 230, TOP = 26, BOTTOM = 6;
export const TODAY_AT = 0.72; // where "today" sits across the owed chart

export function stepPath(values, x0, x1, y) {
  if (!values.length) return '';
  const dx = values.length > 1 ? (x1 - x0) / (values.length - 1) : 0;
  let d = `M${x0.toFixed(1)} ${y(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) d += ` H${(x0 + i * dx).toFixed(1)} V${y(values[i]).toFixed(1)}`;
  return d;
}

/** A soft fill under a line: the line path closed down to the bottom edge. */
const areaPath = (line, x0, x1, bottom) => `${line} V${bottom} H${x0} Z`;

function tick() { try { navigator.vibrate?.(4); } catch { /* not supported */ } }

/**
 * Owed balance as steps — it only moves when a bill arrives or is paid.
 * Left of TODAY is history; right of it (dashed) is what is still owed after
 * each upcoming due date. Drag to land on a real day.
 */
export function StepChart({ past, ahead, scrub, onScrub }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const last = useRef(null);
  const gid = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const all = [...past, ...ahead];
  const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  const y = (v) => TOP + (1 - (v - lo) / (hi - lo || 1)) * (H - TOP - BOTTOM);
  const tx = W * TODAY_AT;
  const pastLine = stepPath(past, 0, tx, y);

  const locate = (e) => {
    const r = ref.current.getBoundingClientRect();
    const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    const p = f <= TODAY_AT
      ? { kind: 'past', index: Math.round((f / TODAY_AT) * (past.length - 1)) }
      : { kind: 'ahead', index: Math.round(((f - TODAY_AT) / (1 - TODAY_AT)) * (ahead.length - 1)) };
    const key = `${p.kind}${p.index}`;
    if (key !== last.current) { last.current = key; tick(); }
    return p;
  };
  const end = () => { dragging.current = false; last.current = null; onScrub(null); };
  const pos = scrub && (scrub.kind === 'past'
    ? { x: (scrub.index / Math.max(1, past.length - 1)) * TODAY_AT, v: past[scrub.index] }
    : { x: TODAY_AT + (scrub.index / Math.max(1, ahead.length - 1)) * (1 - TODAY_AT), v: ahead[scrub.index] });

  return (
    <div
      ref={ref}
      className="chart"
      role="img"
      aria-label="What you owe over time, and what is due ahead. Drag across to see a day."
      onPointerDown={(e) => { dragging.current = true; onScrub(locate(e)); }}
      onPointerMove={(e) => { if (dragging.current || e.pointerType === 'mouse') onScrub(locate(e)); }}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--chart)" stopOpacity=".18" />
            <stop offset="1" stopColor="var(--chart)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(pastLine, 0, tx, H)} fill={`url(#${gid})`} />
        <line x1={tx} x2={tx} y1="20" y2={H} stroke="var(--line-2)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <path d={pastLine} fill="none" stroke="var(--chart)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ transition: 'stroke .6s ease' }} />
        <path d={stepPath(ahead, tx, W, y)} fill="none" stroke="var(--text-2)" strokeWidth="2.5" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="chart-tag" style={{ left: `calc(${TODAY_AT * 100}% - 46px)` }}>TODAY</span>
      <span className="chart-tag" style={{ right: 12 }}>DUE</span>
      {pos && (
        <>
          <span className="chart-cursor" style={{ left: `${pos.x * 100}%` }} />
          <span className="chart-dot" style={{ left: `${pos.x * 100}%`, top: `${(y(pos.v) / H) * 100}%`, borderColor: scrub.kind === 'ahead' ? 'var(--text-2)' : undefined }} />
        </>
      )}
    </div>
  );
}

/** Robinhood-style sparkline for a list row: step line + soft fill, coloured by direction. */
export function Spark({ values, tone = 'flat', width = 76, height = 34 }) {
  const gid = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!values?.length) return <svg width={width} height={height} aria-hidden="true" />;
  const lo = Math.min(...values), hi = Math.max(...values);
  const y = (v) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (height - 6);
  const line = stepPath(values, 0, width, y);
  const color = tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : 'var(--muted)';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(line, 0, width, height)} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/** Larger version of Spark for a supplier page, with drag-to-inspect. */
export function AreaSteps({ values, tone, scrub, onScrub, height = 200 }) {
  const ref = useRef(null);
  const gid = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const dragging = useRef(false);
  // Scaled to its own range (like a share price), with a little room underneath.
  const min = Math.min(...values), max = Math.max(1, ...values);
  const lo = Math.max(0, min - (max - min) * 0.25), hi = max;
  const y = (v) => 18 + (1 - (v - lo) / (hi - lo || 1)) * (height - 30);
  const line = stepPath(values, 0, W, y);
  const color = tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : 'var(--chart)';
  const locate = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.round(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * (values.length - 1));
  };
  const end = () => { dragging.current = false; onScrub(null); };
  return (
    <div ref={ref} className="chart" style={{ height }} role="img" aria-label="Spend in the 30 days up to each day. Drag to see a day."
      onPointerDown={(e) => { dragging.current = true; onScrub(locate(e)); }}
      onPointerMove={(e) => { if (dragging.current || e.pointerType === 'mouse') onScrub(locate(e)); }}
      onPointerUp={end} onPointerCancel={end} onPointerLeave={end}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".3" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(line, 0, W, height)} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {scrub != null && (
        <>
          <span className="chart-cursor" style={{ top: 0, left: `${(scrub / (values.length - 1)) * 100}%` }} />
          <span className="chart-dot" style={{ borderColor: color, left: `${(scrub / (values.length - 1)) * 100}%`, top: `${(y(values[scrub]) / height) * 100}%` }} />
        </>
      )}
    </div>
  );
}

export function MonthBars({ rows, selected, onSelect, ghost }) {
  const max = Math.max(1, ...rows.map((r) => r.value), ghost || 0) * 1.06;
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <button key={r.label} className="bars-col" aria-pressed={i === selected} aria-label={`${r.label} spend`} onClick={() => onSelect(i)}>
          <div className="bars-area">
            {r.current && ghost ? <div className="bars-ghost" style={{ height: `${(ghost / max) * 100}%` }} /> : null}
            <div className="bars-fill" style={{ height: `${(Math.max(0, r.value) / max) * 100}%` }} />
          </div>
          {r.label}
        </button>
      ))}
    </div>
  );
}

// One hue, darker for smaller slices: the mix is about proportion.
const SHADES = ['var(--chart)', '#8FB8D8', '#5E8FB5', '#9AA7B3', '#6B7A88', '#4F5D6B', '#3A4652'];

export function Donut({ rows }) {
  let acc = 0;
  const stops = rows.map((r, i) => {
    const a = acc; acc += r.share;
    return `${SHADES[i] || SHADES.at(-1)} ${a}% ${Math.max(a, acc - 0.8)}%, var(--bg) ${Math.max(a, acc - 0.8)}% ${acc}%`;
  });
  return (
    <div className="mix">
      <div className="donut" style={{ background: `conic-gradient(${stops.join(', ') || 'var(--card-2) 0 100%'})` }} role="img" aria-label="Share of spend by supplier" />
      <div className="legend">
        {rows.slice(0, 6).map((r, i) => (
          <div className="legend-row" key={r.name}>
            <span className="legend-key" style={{ background: SHADES[i] || SHADES.at(-1) }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{r.name}</span>
            <span className="num" style={{ fontWeight: 700 }}>{r.share.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Gauge({ score, label, caption, tone }) {
  const arc = Math.PI * 120;
  const color = tone === 'text' ? 'var(--text)' : `var(--${tone})`;
  return (
    <div className="gauge">
      <svg viewBox="0 0 390 190" width="100%" height="190" role="img" aria-label={`Bill shock ${score} out of 100, ${label}`}>
        <path d="M75 175 A120 120 0 0 1 315 175" fill="none" stroke="var(--card-2)" strokeWidth="20" strokeLinecap="round" />
        <path d="M75 175 A120 120 0 0 1 315 175" fill="none" stroke={color} strokeWidth="20" strokeLinecap="round"
          strokeDasharray={`${(arc * score) / 100} ${arc}`} style={{ transition: 'stroke-dasharray .5s ease' }} />
      </svg>
      <div className="gauge-label" style={{ color }}>{label}</div>
      <div className="gauge-caption num">{caption}</div>
    </div>
  );
}

/** Tiny step line for per-invoice prices. */
export function PriceSteps({ values, width = 64, height = 28, tone }) {
  return <Spark values={values} tone={tone} width={width} height={height} />;
}

/**
 * Dot chart: every dot is one period's total (a day, a week or a month).
 * Solid dots are what was billed; hollow amber dots past TODAY are what is due.
 * Bigger dot = bigger total; a red dot is well above your average.
 * Tap a dot and the readout above says exactly what it is.
 */
export function DotChart({ data, describe, height = 200 }) {
  const { past, ahead, avg, unit } = data;
  // Parents give this a `key` per range, so a new range starts on its latest dot.
  const [sel, setSel] = useState({ kind: 'past', i: past.length - 1 });

  const TOP = 26, BOTTOM = height - 34, TODAY = 74;
  const max = Math.max(1, avg, ...past.map((p) => p.total), ...ahead.map((a) => a.total)) * 1.12;
  const y = (v) => BOTTOM - (Math.max(0, v) / max) * (BOTTOM - TOP);
  const px = (i) => 3 + (i * (TODAY - 6)) / Math.max(1, past.length - 1);
  const ax = (j) => TODAY + 6 + (j * (100 - TODAY - 9)) / Math.max(1, ahead.length - 1);
  const base = unit === 'day' ? 7 : unit === 'week' ? 9 : 12, grow = unit === 'day' ? 7 : 9;
  const tone = (v) => (avg && v > avg * 1.25 ? 'up' : avg && v < avg * 0.75 ? 'down' : 'flat');

  const pts = past.map((p, i) => [px(i) * 10, y(p.total)]);
  const line = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
  const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${BOTTOM} L${pts[0][0].toFixed(1)} ${BOTTOM} Z`;
  const aheadLine = 'M' + [pts.at(-1), ...ahead.map((a, j) => [ax(j) * 10, y(a.total)])].map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');

  const picked = sel.kind === 'past' ? past[sel.i] : ahead[sel.j];
  const info = describe(picked, sel.kind, sel.kind === 'past' ? sel.i === past.length - 1 : false);
  // A month still in progress is judged on its pace, not its total so far.
  const covered = picked.to - picked.from + 1;
  const pace = sel.kind === 'past' && picked.full && covered < picked.full ? (picked.total * picked.full) / covered : null;
  const diff = sel.kind === 'past' && avg ? (((pace ?? picked.total) - avg) / avg) * 100 : null;
  const t = sel.kind === 'past' ? tone(pace ?? picked.total) : 'due';
  const pick = (s) => {
    setSel((cur) => {
      if (cur.kind === s.kind && (cur.i ?? cur.j) === (s.i ?? s.j)) return cur;
      try { navigator.vibrate?.(6); } catch { /* not supported */ }
      return s;
    });
  };
  // Dots can sit closer together than a fingertip, so the whole chart is the
  // touch target: press or drag anywhere and it snaps to the nearest dot.
  const box = useRef(null);
  const dragging = useRef(false);
  const xs = [...past.map((_, i) => ({ x: px(i), s: { kind: 'past', i } })), ...ahead.map((_, j) => ({ x: ax(j), s: { kind: 'ahead', j } }))];
  const snap = (e) => {
    const r = box.current.getBoundingClientRect();
    const f = ((e.clientX - r.left) / r.width) * 100;
    let best = xs[0];
    for (const p of xs) if (Math.abs(p.x - f) < Math.abs(best.x - f)) best = p;
    pick(best.s);
  };
  const k = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);

  return (
    <div>
      <div className="dot-readout" key={`${sel.kind}${sel.i ?? sel.j}`}>
        <div style={{ minWidth: 0 }}>
          <div className="dot-title">{info.title}</div>
          <div className="dot-value num">{'$' + Math.round(picked.total).toLocaleString('en-AU')}</div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          {diff != null
            ? <span className={`pill num ${t === 'flat' ? 'flat' : t}`}>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(0)}% vs avg</span>
            : <span className="pill num due">{picked.count} to pay</span>}
          <div className="dot-sub">{pace ? `on pace for ${k(pace)}` : info.sub}</div>
        </div>
      </div>
      <div className="dots" ref={box} style={{ height }} role="group" aria-label="Spending dots"
        onPointerDown={(e) => { dragging.current = true; snap(e); }}
        onPointerMove={(e) => { if (dragging.current) snap(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}>
        <div className="dots-grid" style={{ top: TOP }} />
        <div className="dots-grid" style={{ top: (TOP + BOTTOM) / 2 }} />
        <div className="dots-grid strong" style={{ top: BOTTOM }} />
        <span className="dots-axis num" style={{ top: TOP - 18 }}>{k(max)}</span>
        <span className="dots-axis num" style={{ top: (TOP + BOTTOM) / 2 - 18 }}>{k(max / 2)}</span>
        {avg > 0 && <div className="dots-avg" style={{ top: y(avg), width: `${TODAY}%` }} />}
        <div className="dots-today" style={{ left: `${TODAY}%`, top: TOP - 10, height: BOTTOM - TOP + 10 }} />
        <div className="dots-future" style={{ left: `calc(${TODAY}% + 4px)`, top: TOP - 10, height: BOTTOM - TOP + 10 }} />
        <svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={area} fill="var(--chart-fill)" />
          <path d={line} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={aheadLine} fill="none" stroke="var(--due)" strokeWidth="2" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        </svg>
        {past.map((p, i) => {
          const on = sel.kind === 'past' && sel.i === i, size = base + Math.round((p.total / max) * grow) + (on ? 6 : 0);
          const tt = tone(p.total), today = i === past.length - 1;
          return (
            <button key={`p${i}`} className={`dot ${tt === 'up' ? 'dot-up' : ''} ${today ? 'dot-today' : ''}`} aria-pressed={on}
              aria-label={`${describe(p, 'past', today).title}: $${Math.round(p.total)}`}
              style={{ left: `${px(i)}%`, top: y(p.total), '--s': `${size}px`, animationDelay: `${i * 16}ms` }}
              onClick={() => pick({ kind: 'past', i })} onFocus={() => pick({ kind: 'past', i })} />
          );
        })}
        {ahead.map((a, j) => {
          const on = sel.kind === 'ahead' && sel.j === j, size = base + Math.round((a.total / max) * grow) + (on ? 6 : 0);
          return (
            <button key={`a${j}`} className="dot dot-due" aria-pressed={on} aria-label={`${describe(a, 'ahead').title}: $${Math.round(a.total)}`}
              style={{ left: `${ax(j)}%`, top: y(a.total), '--s': `${size}px`, animationDelay: `${(past.length + j) * 16}ms` }}
              onClick={() => pick({ kind: 'ahead', j })} onFocus={() => pick({ kind: 'ahead', j })} />
          );
        })}
        <span className="dots-x num" style={{ left: 0 }}>{describe(past[0], 'past').short}</span>
        <span className="dots-x num strong" style={{ left: `calc(${TODAY}% - 18px)` }}>Today</span>
        <span className="dots-x num due" style={{ right: 0 }}>{describe(ahead.at(-1), 'ahead').short}</span>
      </div>
      <div className="dots-legend">
        <span><i className="lg lg-dot" />{unit === 'day' ? 'Each dot is a day' : unit === 'week' ? 'Each dot is a week' : 'Each dot is a month'}</span>
        <span><i className="lg lg-up" />Big {unit}</span>
        <span><i className="lg lg-due" />Due</span>
        {avg > 0 && <span className="num"><i className="lg lg-avg" />avg {k(avg)}</span>}
      </div>
    </div>
  );
}
