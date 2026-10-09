import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { FullScreen, SignaturePad, SupplierChips } from '../components/UI.jsx';
import { money0 } from '../lib/format.js';
import { isoFromOffset, toIso } from '../lib/store.js';
import { describeDeal } from './Deals.jsx';

const MEDAL = ['var(--gold)', 'var(--silver)', 'var(--bronze)'];
const ENDS = [['End of month', () => endOfMonth(0)], ['Next month', () => endOfMonth(1)], ['90 days', () => 90]];

function endOfMonth(plus) {
  const t = new Date();
  const end = new Date(t.getFullYear(), t.getMonth() + 1 + plus, 0);
  return Math.round((end - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
}

const defaultTarget = (s, kind) => (kind === 'share' ? Math.min(90, Math.round(s.share) + 10) : Math.round(s.spend / 3 / 500) * 500 + 1000);

/**
 * Counter mode: turn the phone around, show the rep where your money goes
 * (hide anyone you don't want them to see), agree a target, both sign.
 */
export default function Counter({ data, ins, presetSupplier, onClose, onHide, onLock }) {
  const ranked = ins.ranked.filter((s) => s.spend > 0);
  const [composing, setComposing] = useState(!!presetSupplier);
  const [locked, setLocked] = useState(null);
  const first = ranked.find((s) => s.id === presetSupplier) || ranked[0];
  const [draft, setDraft] = useState({ supplierId: first?.id, kind: 'share', target: first ? defaultTarget(first, 'share') : 30, reward: '', ends: 0, rep: first?.rep && first.rep !== 'Trade desk' ? first.rep : '' });
  const [sig, setSig] = useState({ you: '', rep: '' });
  const [error, setError] = useState('');
  const sup = ranked.find((s) => s.id === draft.supplierId);
  const set = (patch) => { setError(''); setDraft((d) => ({ ...d, ...patch })); };
  const top = ranked.slice(0, 3), rest = ranked.slice(3);
  const isShare = draft.kind === 'share';

  const lock = () => {
    if (!draft.reward.trim()) return setError('Add what they’re giving you.');
    if (!sig.you || !sig.rep) return setError('You both need to sign.');
    const deal = {
      id: `d${Date.now()}`, supplierId: draft.supplierId, kind: draft.kind, target: draft.target,
      reward: draft.reward.trim(), rep: draft.rep.trim(),
      // Real dates, so the deal window is still right next week.
      startIso: toIso(new Date()), endIso: isoFromOffset(ENDS[draft.ends][1]()),
      signatures: { you: sig.you, rep: sig.rep }, signedAt: new Date().toISOString(),
    };
    onLock(deal);
    setLocked(deal);
    setComposing(false);
    try { navigator.vibrate?.([10, 40, 20]); } catch { /* not supported */ }
  };

  if (!first) {
    return (
      <FullScreen label="Counter mode" onClose={onClose} closeIcon="close">
        <div className="page"><div className="card empty"><div className="h2">Add some bills first</div><p className="muted">Counter mode shows the rep where your money goes — it needs a few bills to work with.</p></div></div>
      </FullScreen>
    );
  }

  return (
    <FullScreen label="Counter mode" onClose={onClose} closeIcon="close" right={<span className="tag">Counter mode</span>}>
      <div className="page" style={{ paddingTop: 8 }}>
        <div>
          <div className="hero-label">{data.business.name} · 90 days</div>
          <div className="hero-value num">{money0(ranked.reduce((t, s) => t + s.spend, 0))}</div>
          <div className="muted" style={{ marginTop: 4, fontWeight: 600 }}>across {ranked.length} suppliers</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {top.map((s, i) => {
            const hidden = data.hidden.includes(s.id);
            return (
              <div key={s.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="num" style={{ width: 36, height: 36, borderRadius: 18, background: `color-mix(in srgb, ${MEDAL[i]} 18%, transparent)`, color: MEDAL[i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hidden ? 'Hidden' : s.name}</div>
                    <div className="num muted" style={{ fontWeight: 600 }}>{hidden ? '—' : money0(s.spend)}</div>
                  </div>
                  <span className="num" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em' }}>{hidden ? '··' : `${s.share.toFixed(0)}%`}</span>
                  <button className="icon-btn" aria-label={`${hidden ? 'Show' : 'Hide'} ${s.name}`} aria-pressed={hidden} onClick={() => onHide(s.id)}>
                    <Icon name={hidden ? 'eyeOff' : 'eye'} size={19} />
                  </button>
                </div>
                <div className="bar-track" style={{ marginTop: 14 }}><div style={{ height: '100%', borderRadius: 4, width: hidden ? 0 : `${s.share}%`, background: MEDAL[i] }} /></div>
              </div>
            );
          })}
          {rest.length > 0 && <div className="num muted" style={{ fontWeight: 600, paddingLeft: 4 }}>+ {rest.length} others · {rest.reduce((t, s) => t + s.share, 0).toFixed(0)}%</div>}
        </div>

        {locked && (
          <div className="card" style={{ position: 'relative', border: '2px solid var(--mood)' }}>
            <div className="label">Shook on it</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, paddingRight: 90 }}>{describeDeal(locked, data.suppliers)}</div>
            <div style={{ marginTop: 6, fontWeight: 600 }}>{locked.reward} · {ENDS[draft.ends][0].toLowerCase()}</div>
            <div className="muted" style={{ marginTop: 4 }}>With {locked.rep || 'the rep'} · tracked from your bills</div>
            <span className="stamp">LOCKED</span>
          </div>
        )}

        {!composing && !locked && <button className="btn btn-primary btn-block" onClick={() => setComposing(true)}><Icon name="handshake" size={20} />Make a deal on the spot</button>}

        {composing && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="sheet-title">The deal</div>
            <div className="field">
              <span className="label">With</span>
              <SupplierChips suppliers={ranked} value={draft.supplierId} onChange={(id) => { const s = ranked.find((x) => x.id === id); set({ supplierId: id, target: defaultTarget(s, draft.kind), rep: s.rep && s.rep !== 'Trade desk' ? s.rep : '' }); }} />
            </div>
            <div className="field">
              <span className="label">I'll give you</span>
              <div className="seg" style={{ background: 'var(--bg)' }}>
                <button aria-selected={isShare} onClick={() => set({ kind: 'share', target: defaultTarget(sup, 'share') })}>Share of my spend</button>
                <button aria-selected={!isShare} onClick={() => set({ kind: 'spend', target: defaultTarget(sup, 'spend') })}>A dollar amount</button>
              </div>
              <label htmlFor="deal-target" className="num" style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 6 }}>
                {isShare ? `${draft.target}%` : money0(draft.target)}
              </label>
              <span className="muted" style={{ fontWeight: 600 }}>{isShare ? `${sup.name} has ${sup.share.toFixed(0)}% today` : `${sup.name} averages ${money0(sup.spend / 3)} a month`}</span>
              <input id="deal-target" type="range" min={isShare ? 5 : 1000} max={isShare ? 90 : 30000} step={isShare ? 1 : 500} value={draft.target} onChange={(e) => set({ target: Number(e.target.value) })} />
            </div>
            <label className="field">
              <span className="label">You give me</span>
              <input className="input" value={draft.reward} onChange={(e) => set({ reward: e.target.value })} placeholder="e.g. Milwaukee Packout, 3% back" />
            </label>
            <div className="field">
              <span className="label">By</span>
              <div className="chips">{ENDS.map(([l], i) => <button key={l} className="chip" aria-pressed={draft.ends === i} onClick={() => set({ ends: i })}>{l}</button>)}</div>
            </div>
            <label className="field">
              <span className="label">Rep's name</span>
              <input className="input" value={draft.rep} onChange={(e) => set({ rep: e.target.value })} placeholder="Who you're dealing with" autoComplete="off" />
            </label>
            <SignaturePad label="Your signature" value={sig.you} onChange={(v) => { setError(''); setSig((s) => ({ ...s, you: v })); }} />
            <SignaturePad label={`${draft.rep.trim() || 'Rep'}’s signature`} value={sig.rep} onChange={(v) => { setError(''); setSig((s) => ({ ...s, rep: v })); }} />
            {error && <div className="error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-block" onClick={lock}>Lock it in</button>
          </div>
        )}
      </div>
    </FullScreen>
  );
}
