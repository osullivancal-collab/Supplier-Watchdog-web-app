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
    timer.current = setTimeout(() => setMsg(null), 2400);
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
export function Sheet({ label, onClose, children }) {
  useEscape(onClose);
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={label}>
      <button className="scrim-close" aria-label="Close" onClick={onClose} />
      <div className="sheet">
        <div className="grabber" />
        {children}
      </div>
    </div>
  );
}

// ----- full-screen overlay (same look as the app) -----
export function FullScreen({ label, onClose, closeIcon = 'close', right, children }) {
  useEscape(onClose);
  return (
    <div className="fullscreen" role="dialog" aria-modal="true" aria-label={label}>
      <div className="overlay-head">
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name={closeIcon} size={20} stroke={2} /></button>
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

// ----- signature pad -----
// Stores the drawing as an SVG path in a 326×96 box so it can be saved with the deal.
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
    return `${(((e.clientX - r.left) / r.width) * 326).toFixed(1)} ${(((e.clientY - r.top) / r.height) * 96).toFixed(1)}`;
  };
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="field-label" id={id} style={{ margin: 0 }}>{label}</span>
        <button className="btn-sm muted" onClick={() => onChange('')}>Clear</button>
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
        <svg viewBox="0 0 326 96" preserveAspectRatio="none">
          {value && <path d={value} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {!value && <span className="sig-hint">Sign with your finger</span>}
      </div>
    </div>
  );
}
