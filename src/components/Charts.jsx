import { useId, useRef } from 'react';

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
            <stop offset="0" stopColor="var(--mood)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--mood)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(pastLine, 0, tx, H)} fill={`url(#${gid})`} />
        <line x1={tx} x2={tx} y1="20" y2={H} stroke="var(--line-2)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <path d={pastLine} fill="none" stroke="var(--mood)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ transition: 'stroke .6s ease' }} />
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
  const color = tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : 'var(--mood)';
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
const SHADES = ['var(--mood)', '#8FB8D8', '#5E7E98', '#3E5568', '#2C3B48', '#222C35', '#1B232B'];

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
