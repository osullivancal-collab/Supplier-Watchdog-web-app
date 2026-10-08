import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { FullScreen, SignaturePad } from '../components/UI.jsx';
import { money0 } from '../lib/format.js';
import { describeDeal } from './League.jsx';

const MEDAL = ['var(--gold)', 'var(--silver)', 'var(--bronze)'];
const ENDS = [['End of month', () => endOfMonth(0)], ['End of next month', () => endOfMonth(1)], ['90 days', () => 90]];

function endOfMonth(plus) {
  const t = new Date();
  const end = new Date(t.getFullYear(), t.getMonth() + 1 + plus, 0);
  return Math.round((end - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
}

const defaultTarget = (s, kind) => (kind === 'share' ? Math.min(90, Math.round(s.share) + 10) : Math.round(s.spend / 3 / 500) * 500 + 1000);

/**
 * Counter mode: turn the phone around, show the rep your spend weights (hide
 * any you don't want them to see), agree a target and both sign on screen.
 */
export default function Counter({ data, ins, presetSupplier, onClose, onHide, onLock }) {
  const [composing, setComposing] = useState(!!presetSupplier);
  const [locked, setLocked] = useState(null);
  const first = ins.ranked.find((s) => s.id === presetSupplier) || ins.ranked[0];
  const [draft, setDraft] = useState({ supplierId: first.id, kind: 'share', target: defaultTarget(first, 'share'), reward: '', ends: 0, rep: '' });
  const [sig, setSig] = useState({ you: '', rep: '' });
  const [error, setError] = useState('');
  const sup = ins.ranked.find((s) => s.id === draft.supplierId);
  const set = (patch) => { setError(''); setDraft((d) => ({ ...d, ...patch })); };
  const top = ins.ranked.slice(0, 3), rest = ins.ranked.slice(3);
  const isShare = draft.kind === 'share';

  const lock = () => {
    if (!draft.reward.trim()) return setError('Add what they’re giving you.');
    if (!sig.you || !sig.rep) return setError('You both need to sign.');
    const deal = {
      id: `d${Date.now()}`, supplierId: draft.supplierId, kind: draft.kind, target: draft.target,
      reward: draft.reward.trim(), rep: draft.rep.trim(), start: 0, end: ENDS[draft.ends][1](),
      signatures: { you: sig.you, rep: sig.rep }, signedAt: new Date().toISOString(),
    };
    onLock(deal);
    setLocked(deal);
    setComposing(false);
    try { navigator.vibrate?.([10, 40, 20]); } catch { /* not supported: fine */ }
  };

  return (
    <FullScreen label="Counter mode" onClose={onClose} right={<span className="muted" style={{ fontSize: 12, paddingRight: 4 }}>Counter mode</span>}>
      <div className="page" style={{ paddingTop: 8, gap: 22 }}>
        <div>
          <div className="muted" style={{ fontSize: 15 }}>{data.business.name} · last 90 days</div>
          <div className="num" style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em' }}>{money0(ins.total90)}</div>
          <div className="muted">spent across {ins.ranked.length} suppliers</div>
        </div>

        <div>
          {top.map((s, i) => {
            const hidden = data.hidden.includes(s.id);
            return (
              <div key={s.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="num" style={{ width: 22, fontWeight: 600, color: MEDAL[i] }}>{i + 1}</span>
                  <div className="row-main">
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{hidden ? 'Hidden' : s.name}</div>
                    <div className="num muted" style={{ fontSize: 13 }}>{hidden ? '—' : money0(s.spend)}</div>
                  </div>
                  <span className="num" style={{ fontSize: 28, fontWeight: 600 }}>{hidden ? '··' : `${s.share.toFixed(0)}%`}</span>
                  <button className="icon-btn muted" aria-label={`${hidden ? 'Show' : 'Hide'} ${s.name}`} aria-pressed={hidden} onClick={() => onHide(s.id)}>
                    <Icon name={hidden ? 'eyeOff' : 'eye'} size={18} stroke={2} />
                  </button>
                </div>
                <div className="bar-track" style={{ margin: '10px 0 0 34px' }}><div style={{ height: 4, width: hidden ? 0 : `${s.share}%`, background: MEDAL[i] }} /></div>
              </div>
            );
          })}
          {rest.length > 0 && <div className="num faint" style={{ fontSize: 12, paddingTop: 10 }}>+ {rest.length} others · {rest.reduce((t, s) => t + s.share, 0).toFixed(0)}%</div>}
        </div>

        {locked && (
          <div className="card" style={{ position: 'relative', padding: 16 }}>
            <div className="num muted" style={{ fontSize: 11 }}>AGREED AT THE COUNTER</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{describeDeal(locked, data.suppliers)}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{locked.reward} · {ENDS[draft.ends][0].toLowerCase()}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Signed with {locked.rep || 'the rep'} · tracked from your invoices</div>
            <span className="stamp">LOCKED</span>
          </div>
        )}

        {!composing && !locked && <button className="btn btn-primary btn-block" style={{ height: 52 }} onClick={() => setComposing(true)}>Make a deal on the spot</button>}

        {composing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label">With</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ins.ranked.map((s) => (
                  <button key={s.id} className="chip" aria-pressed={s.id === draft.supplierId} onClick={() => set({ supplierId: s.id, target: defaultTarget(s, draft.kind) })}>{s.name}</button>
                ))}
              </div>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label">I'll give you</legend>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['share', 'Share of my spend'], ['spend', 'A dollar amount']].map(([k, l]) => (
                  <button key={k} className="chip" style={{ flex: 1 }} aria-pressed={draft.kind === k} onClick={() => set({ kind: k, target: defaultTarget(sup, k) })}>{l}</button>
                ))}
              </div>
              <label htmlFor="deal-target" className="num" style={{ display: 'block', fontSize: 30, fontWeight: 600, marginTop: 12 }}>
                {isShare ? `${draft.target}% of my spend` : money0(draft.target)}
              </label>
              <div className="muted" style={{ fontSize: 13 }}>
                {isShare ? `${sup.name} has ${sup.share.toFixed(0)}% today` : `${sup.name} averages ${money0(sup.spend / 3)} a month`}
              </div>
              <input id="deal-target" type="range" min={isShare ? 5 : 1000} max={isShare ? 90 : 30000} step={isShare ? 1 : 500}
                value={draft.target} onChange={(e) => set({ target: Number(e.target.value) })} style={{ marginTop: 6 }} />
            </fieldset>
            <div>
              <label htmlFor="deal-reward" className="field-label">You give me</label>
              <input id="deal-reward" className="input" value={draft.reward} onChange={(e) => set({ reward: e.target.value })} placeholder="e.g. Milwaukee Packout, $200 credit" />
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label">By</legend>
              <div style={{ display: 'flex', gap: 6 }}>
                {ENDS.map(([l], i) => <button key={l} className="chip" style={{ flex: 1, fontSize: 12 }} aria-pressed={draft.ends === i} onClick={() => set({ ends: i })}>{l}</button>)}
              </div>
            </fieldset>
            <div>
              <label htmlFor="deal-rep" className="field-label">Rep's name</label>
              <input id="deal-rep" className="input" value={draft.rep} onChange={(e) => set({ rep: e.target.value })} placeholder="Who you're dealing with" autoComplete="off" />
            </div>
            <SignaturePad label="Your signature" value={sig.you} onChange={(v) => { setError(''); setSig((s) => ({ ...s, you: v })); }} />
            <SignaturePad label={`${draft.rep.trim() || 'Rep'}’s signature`} value={sig.rep} onChange={(v) => { setError(''); setSig((s) => ({ ...s, rep: v })); }} />
            {error && <div role="alert" className="up" style={{ fontSize: 13 }}>{error}</div>}
            <button className="btn btn-primary btn-block" style={{ height: 52 }} onClick={lock}>Lock it in</button>
          </div>
        )}
      </div>
    </FullScreen>
  );
}
