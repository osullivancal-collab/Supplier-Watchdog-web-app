import { useRef } from 'react';

const W = 1000, H = 200, TOP = 22, BOTTOM = 8;
export const TODAY_AT = 0.72; // where "today" sits across the chart

function stepPath(values, x0, x1, y) {
  const dx = values.length > 1 ? (x1 - x0) / (values.length - 1) : 0;
  let d = `M${x0.toFixed(1)} ${y(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) d += ` H${(x0 + i * dx).toFixed(1)} V${y(values[i]).toFixed(1)}`;
  return d;
}

/**
 * Owed balance as steps: the line only moves when a bill arrives or is paid.
 * Left of "today" is history; right of it (dashed) is what is still owed after
 * each upcoming due date. Drag across to land on a real day.
 */
export function StepChart({ past, ahead, scrub, onScrub }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const all = [...past, ...ahead];
  const lo = Math.min(...all), hi = Math.max(...all);
  const y = (v) => TOP + (1 - (v - lo) / (hi - lo || 1)) * (H - TOP - BOTTOM);
  const tx = W * TODAY_AT;

  const locate = (e) => {
    const r = ref.current.getBoundingClientRect();
    const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    if (f <= TODAY_AT) return { kind: 'past', index: Math.round((f / TODAY_AT) * (past.length - 1)) };
    return { kind: 'ahead', index: Math.round(((f - TODAY_AT) / (1 - TODAY_AT)) * (ahead.length - 1)) };
  };
  const pos = scrub && (scrub.kind === 'past'
    ? { x: (scrub.index / (past.length - 1)) * TODAY_AT, v: past[scrub.index] }
    : { x: TODAY_AT + (scrub.index / (ahead.length - 1)) * (1 - TODAY_AT), v: ahead[scrub.index] });

  return (
    <div
      ref={ref}
      className="chart"
      role="img"
      aria-label="Owed balance over time and what is due ahead. Drag to inspect a day."
      onPointerDown={(e) => { dragging.current = true; onScrub(locate(e)); }}
      onPointerMove={(e) => { if (dragging.current || e.pointerType === 'mouse') onScrub(locate(e)); }}
      onPointerUp={() => { dragging.current = false; onScrub(null); }}
      onPointerCancel={() => { dragging.current = false; onScrub(null); }}
      onPointerLeave={() => { dragging.current = false; onScrub(null); }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1={tx} x2={tx} y1="14" y2={H} stroke="#2A313B" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        <path d={stepPath(past, 0, tx, y)} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={stepPath(ahead, tx, W, y)} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="chart-tag" style={{ left: `calc(${TODAY_AT * 100}% - 36px)` }}>TODAY</span>
      <span className="chart-tag" style={{ right: 8 }}>DUE AHEAD</span>
      {pos && (
        <>
          <span className="chart-cursor" style={{ left: `${pos.x * 100}%` }} />
          <span className="chart-dot" style={{ left: `${pos.x * 100}%`, top: `${(y(pos.v) / H) * 100}%` }} />
        </>
      )}
    </div>
  );
}

export function MonthBars({ rows, selected, onSelect, ghost }) {
  const max = Math.max(...rows.map((r) => r.value), ghost || 0) * 1.06 || 1;
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <button key={r.label} className="bars-col" aria-pressed={i === selected} aria-label={`${r.label} spend`} onClick={() => onSelect(i)}>
          <div className="bars-area">
            {r.current && ghost ? <div className="bars-ghost" style={{ height: `${(ghost / max) * 100}%` }} /> : null}
            <div className="bars-fill" style={{ height: `${(r.value / max) * 100}%` }} />
          </div>
          {r.label}
        </button>
      ))}
    </div>
  );
}

// One hue, darker for smaller slices: the mix is about proportion, not identity.
const SHADES = ['#8FB8D8', '#5E7E98', '#3E5568', '#2C3B48', '#222C35', '#1B232B'];

export function Donut({ rows }) {
  let acc = 0;
  const stops = rows.map((r, i) => {
    const a = acc; acc += r.share;
    return `${SHADES[i]} ${a}% ${acc - 0.6}%, var(--bg) ${acc - 0.6}% ${acc}%`;
  });
  return (
    <div className="mix">
      <div className="donut" style={{ background: `conic-gradient(${stops.join(', ')})` }} role="img" aria-label="Share of spend by supplier" />
      <div className="legend">
        {rows.map((r, i) => (
          <div className="legend-row" key={r.name}>
            <span className="legend-key" style={{ background: SHADES[i] }} />
            <span style={{ flex: 1, color: 'var(--text-2)' }}>{r.name}</span>
            <span className="num">{r.share.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Gauge({ score, label, caption, tone }) {
  const arc = Math.PI * 110;
  return (
    <div className="gauge">
      <svg viewBox="0 0 390 172" width="100%" height="172" role="img" aria-label={`Bill shock ${score} out of 100, ${label}`}>
        <path d="M85 160 A110 110 0 0 1 305 160" fill="none" stroke="var(--line)" strokeWidth="14" strokeLinecap="round" />
        <path d="M85 160 A110 110 0 0 1 305 160" fill="none" stroke={`var(--${tone})`} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${(arc * score) / 100} ${arc}`} style={{ transition: 'stroke-dasharray .4s ease' }} />
      </svg>
      <div className="gauge-label" style={{ color: `var(--${tone})` }}>{label}</div>
      <div className="gauge-caption num muted">{caption}</div>
    </div>
  );
}

/** Tiny step line for per-invoice prices. */
export function PriceSteps({ values, width = 56, height = 22, className }) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const y = (v) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (height - 6);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      <path d={stepPath(values, 0, width, y)} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
