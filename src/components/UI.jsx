import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// ----- toast -----
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  const show = useCallback((text) => {
    clearTimeout(timer.current);
    setMsg(text);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite">{msg && <div className="toast" role="status">{msg}</div>}</div>
    </ToastCtx.Provider>
  );
}

// ----- bottom sheet -----
export function Sheet({ label, title, onClose, children }) {
  useEscape(onClose);
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={label || title}>
      <button className="scrim-close" aria-label="Close" onClick={onClose} />
      <div className="sheet">
        <div className="grabber" />
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 className="sheet-title">{title}</h2>
            <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ----- full-screen overlay (same look as the app) -----
export function FullScreen({ label, onClose, closeIcon = 'back', right, children }) {
  useEscape(onClose);
  return (
    <div className="fullscreen" role="dialog" aria-modal="true" aria-label={label}>
      <div className="overlay-head">
        <button className="icon-btn" aria-label={closeIcon === 'back' ? 'Back' : 'Close'} onClick={onClose}><Icon name={closeIcon} size={20} /></button>
        {right}
      </div>
      <div className="scroll">{children}</div>
    </div>
  );
}

export function useEscape(fn) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') fn(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}

/** Animates a number towards its new value, like a ticker updating. */
export function useCountUp(value, ms = 550) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { from.current = value; setShown(value); return; }
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

// ----- signature pad -----
// Stores the drawing as an SVG path in a 326×110 box so it can be saved with the deal.
export function SignaturePad({ label, value, onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  // Pointer events can arrive faster than React re-renders; keep the latest
  // path in a ref so no stroke segment is dropped.
  const path = useRef(value);
  useEffect(() => { path.current = value; }, [value]);
  const add = (seg) => { path.current = `${path.current}${seg}`; onChange(path.current); };
  const pt = (e) => {
    const r = ref.current.getBoundingClientRect();
    return `${(((e.clientX - r.left) / r.width) * 326).toFixed(1)} ${(((e.clientY - r.top) / r.height) * 110).toFixed(1)}`;
  };
  const id = 'sig-' + label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div className="field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label" id={id}>{label}</span>
        {value && <button className="link" style={{ fontSize: 14, minHeight: 32 }} onClick={() => onChange('')}>Clear</button>}
      </div>
      <div
        ref={ref}
        className="sig"
        role="img"
        aria-labelledby={id}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); drawing.current = true; add(` M${pt(e)}`); }}
        onPointerMove={(e) => { if (drawing.current) add(` L${pt(e)}`); }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      >
        <svg viewBox="0 0 326 110" preserveAspectRatio="none">
          {value && <path d={value} fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {!value && <span className="sig-hint">Sign here</span>}
      </div>
    </div>
  );
}

/** Supplier picker as big chips, with an optional "+ New" chip. */
export function SupplierChips({ suppliers, value, onChange, onNew }) {
  return (
    <div className="chips" role="group" aria-label="Supplier">
      {suppliers.map((s) => (
        <button key={s.id} className="chip" aria-pressed={s.id === value} onClick={() => onChange(s.id)}>{s.name}</button>
      ))}
      {onNew && <button className="chip" onClick={onNew} style={{ color: 'var(--mood)' }}>+ New</button>}
    </div>
  );
}
