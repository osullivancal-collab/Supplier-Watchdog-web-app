import { useEffect, useMemo, useRef, useState } from 'react';
import { PriceSteps } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import { Sheet, SupplierChips, useToast } from '../components/UI.jsx';
import { dayLabel, dirClass, kfmt, money, pct, whenDue } from '../lib/format.js';
import { TERMS, dueFromTerms, isCashTerms, itemChange, previewPurchase } from '../lib/model.js';
import { daysLeft, openBillingPortal, photoUrl, readInvoice, startCheckout } from '../lib/backend.js';
import { matchSupplier } from '../lib/match.js';
import { isoFromOffset, loadPhoto, newId, offsetFromIso, shrinkPhoto, toIso, vendorName } from '../lib/store.js';

/** The docket photo: from this phone if it's here, else a short-lived link from storage. */
function usePhoto(bill) {
  const [url, setUrl] = useState(() => (bill?.photo ? loadPhoto(bill.id) : null));
  useEffect(() => {
    let alive = true;
    if (!url && bill?.photoPath) photoUrl(bill.photoPath).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [bill?.photoPath]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

// ---------------------------------------------------------------------------
// The + menu
// ---------------------------------------------------------------------------
export function AddMenu({ onClose, go }) {
  const groups = [
    ['Add', [
      ['camera', 'Snap a docket', 'Take a photo — Watchdog fills it in', () => go.addBill(null, { photo: true })],
      ['bill', 'Type in a bill', 'Or a credit for a return', () => go.addBill()],
      ['store', 'Add a supplier', 'Anyone who bills you', () => go.addSupplier()],
    ]],
    ['At the counter', [
      ['handshake', 'Counter mode', 'Show the rep your numbers and do a deal', () => go.counter()],
      ['calc', 'Try a buy', 'See what a purchase does before you sign', () => go.tryPurchase()],
    ]],
  ];
  return (
    <Sheet title="What do you want to do?" onClose={onClose}>
      {groups.map(([label, items]) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="label">{label}</div>
          {items.map(([icon, title, sub, fn]) => (
            <button key={title} className="action" onClick={fn}>
              <span className="action-icon"><Icon name={icon} size={22} /></span>
              <span style={{ flex: 1 }}><span className="action-title" style={{ display: 'block' }}>{title}</span><span className="action-sub">{sub}</span></span>
              <Icon name="chevron" size={20} style={{ color: 'var(--muted)' }} />
            </button>
          ))}
        </div>
      ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Add / edit a bill
// ---------------------------------------------------------------------------
export function BillForm({ data, bill, preset, onClose, onSave, onNewSupplier, canRead = false }) {
  const toast = useToast();
  const editing = !!bill;
  const fileRef = useRef(null);
  const sup0 = bill?.supplierId ?? preset?.supplierId ?? data.suppliers[0]?.id ?? null;
  const [credit, setCredit] = useState(editing ? bill.total < 0 : !!preset?.credit);
  const [amount, setAmount] = useState(editing ? String(Math.abs(bill.total)) : preset?.amount ? String(preset.amount) : '');
  const [supplierId, setSupplierId] = useState(sup0);
  const termsOf = (id) => data.suppliers.find((s) => s.id === id)?.terms || '30 days EOM';
  const [terms, setTerms] = useState(editing ? null : termsOf(sup0));
  const [issued, setIssued] = useState(editing ? isoFromOffset(bill.issued) : toIso(new Date()));
  const [due, setDue] = useState(editing ? isoFromOffset(bill.due) : null);
  const [ref, setRef] = useState(bill?.ref || '');
  const [job, setJob] = useState(bill?.job || '');
  const savedPhoto = usePhoto(editing ? bill : null);
  const [photoChange, setPhotoChange] = useState(undefined); // undefined = unchanged, null = removed, else new photo
  const photo = photoChange === undefined ? savedPhoto : photoChange;
  const [newSup, setNewSup] = useState(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState(null); // { flags, confidence } from the invoice reader

  // Opening "Snap a docket" goes straight to the camera.
  useEffect(() => { if (preset?.photo) fileRef.current?.click(); }, [preset]);

  // Due date follows the terms unless the user picks a date themselves.
  const issuedOff = offsetFromIso(issued);
  const dueOff = terms ? dueFromTerms(issuedOff, terms) : offsetFromIso(due);
  const pickSupplier = (id) => { setSupplierId(id); if (!editing || terms) setTerms(termsOf(id)); };

  // Fill the form from what the reader saw. Only fills; the tradie still checks and saves.
  const applyReading = (r) => {
    const b = r.bill;
    if (b.total != null) { setAmount(String(Math.abs(b.total))); setCredit(b.total < 0); }
    if (b.supplierName) {
      const hit = matchSupplier(b.supplierName, data.suppliers);
      if (hit) pickSupplier(hit.id); else setNewSup(b.supplierName);
    }
    if (b.issuedOn && b.issuedOn <= toIso(new Date())) setIssued(b.issuedOn);
    const t = b.terms && TERMS.find((x) => x.toLowerCase() === b.terms.trim().toLowerCase());
    if (b.dueOn) { setTerms(null); setDue(b.dueOn); } else if (t) setTerms(t);
    if (b.ref) setRef(b.ref);
    if (b.job) setJob(b.job);
    setRead({ flags: r.flags, confidence: r.confidence });
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let shrunk;
    try { shrunk = await shrinkPhoto(file); setPhotoChange(shrunk); } catch (err) { toast(err.message); return; }
    if (!canRead || editing) return;
    setReading(true);
    try { applyReading(await readInvoice([shrunk])); }
    catch (err) { console.error('[bill] read failed', err); toast(`${err.message} You can type it in.`); }
    finally { setReading(false); }
  };

  const save = async () => {
    const n = Number(String(amount).replace(/[^0-9.]/g, ''));
    if (!supplierId) return setError('Pick who the bill is from.');
    if (!n || n <= 0) return setError('Enter the amount.');
    const total = Math.round(n * 100) / 100 * (credit ? -1 : 1);
    const stored = {
      // Keep what the form doesn't show (vendor, stored photo, how it arrived).
      ...(bill ? { vendor: bill.vendor, photoPath: bill.photoPath, status: bill.status, source: bill.source, confidence: bill.confidence } : {}),
      ...(read ? { source: 'photo', confidence: read.confidence } : {}),
      id: bill?.id || newId(),
      supplierId,
      ref: ref.trim(),
      total,
      issued,
      due: isoFromOffset(dueOff),
      paid: bill ? (bill.paid == null ? null : isoFromOffset(bill.paid)) : (terms && isCashTerms(terms) && !credit ? issued : null),
      job: job.trim() || null,
      photo: !!photo,
    };
    onSave(stored, !editing, editing ? photoChange : (photo || undefined));
  };

  return (
    <Sheet title={editing ? 'Edit bill' : credit ? 'Add a credit' : 'Add a bill'} onClose={onClose}>
      <div className="seg">
        <button aria-selected={!credit} onClick={() => setCredit(false)}>Bill</button>
        <button aria-selected={credit} onClick={() => setCredit(true)}>Credit / return</button>
      </div>

      <label className="money-input num" style={{ color: credit ? 'var(--down)' : 'var(--text)' }}>
        <span>{credit ? '−$' : '$'}</span>
        <input aria-label="Amount" inputMode="decimal" placeholder="0.00" value={amount} autoFocus={!preset?.photo}
          onChange={(e) => { setError(''); setAmount(e.target.value.replace(/[^0-9.]/g, '')); }} />
      </label>

      <div className="field">
        <span className="label">From</span>
        {newSup == null ? (
          <SupplierChips suppliers={data.suppliers} value={supplierId} onChange={pickSupplier} onNew={() => setNewSup('')} />
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" aria-label="New supplier name" placeholder="Supplier name" value={newSup} autoFocus onChange={(e) => setNewSup(e.target.value)} />
            <button className="btn btn-primary" style={{ height: 54 }} onClick={async () => {
              if (!newSup.trim()) return;
              const id = await onNewSupplier(newSup.trim());
              if (!id) return;
              setNewSup(null); setSupplierId(id); setTerms('30 days EOM');
            }}>Add</button>
          </div>
        )}
      </div>

      <div className="tiles">
        <label className="field">
          <span className="label">Dated</span>
          <input className="input" type="date" value={issued} max={toIso(new Date())} onChange={(e) => e.target.value && setIssued(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Due</span>
          <input className="input" type="date" value={isoFromOffset(dueOff)} onChange={(e) => { if (e.target.value) { setTerms(null); setDue(e.target.value); } }} />
        </label>
      </div>
      <div className="field" style={{ marginTop: -6 }}>
        <span className="label">Terms {terms ? `· ${whenDue(dueOff)}` : '· own date'}</span>
        <div className="chips">
          {TERMS.map((t) => <button key={t} className="chip" aria-pressed={terms === t} onClick={() => setTerms(t)}>{t}</button>)}
        </div>
      </div>

      <div className="field">
        <span className="label">Job (optional)</span>
        <input className="input" placeholder="e.g. Smith reno" value={job} onChange={(e) => setJob(e.target.value)} list="jobs" />
        <datalist id="jobs">{data.jobs.map((j) => <option key={j} value={j} />)}</datalist>
      </div>
      <label className="field">
        <span className="label">Invoice no. (optional)</span>
        <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" />
      </label>

      <div className="field">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: 'none' }} />
        {photo ? (
          <div style={{ position: 'relative' }}>
            <img className="photo-thumb" src={photo} alt="Docket" />
            <button className="icon-btn" aria-label="Remove photo" onClick={() => setPhotoChange(null)} style={{ position: 'absolute', top: 8, right: 8 }}><Icon name="close" size={18} /></button>
          </div>
        ) : (
          <button className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()}><Icon name="camera" size={20} />Photo of the docket</button>
        )}
      </div>

      {reading && <div className="tag" role="status" style={{ height: 'auto', padding: '10px 12px', fontSize: 15 }}>Reading the docket…</div>}
      {read && (
        <div className="card" style={{ background: 'var(--bg)', boxShadow: 'none', display: 'flex', flexDirection: 'column', gap: 8 }} role="status">
          <div style={{ fontWeight: 800 }}>{read.flags.length ? 'Read it — check these' : 'Read it — check and save'}</div>
          {read.flags.map((f) => <div key={f.kind} className="muted" style={{ fontSize: 14 }}>• {f.text}</div>)}
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={reading} onClick={save}>{editing ? 'Save changes' : credit ? 'Add credit' : 'Add bill'}</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// One bill
// ---------------------------------------------------------------------------
export function BillSheet({ data, bill, pending, onClose, onPay, onEdit, onDelete, onConfirm }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photo = usePhoto(bill);
  const paid = bill.paid != null;
  const credit = bill.total < 0;
  return (
    <Sheet title={vendorName(bill, data.suppliers)} onClose={onClose}>
      <div>
        <div className={`num ${credit ? 'down' : ''}`} style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(bill.total)}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {pending ? <span className="tag warn">Not confirmed</span>
            : paid ? <span className="tag down">Paid {dayLabel(bill.paid)}</span>
            : credit ? <span className="tag">Not used yet</span>
            : <span className={`tag ${bill.due < 0 ? 'up' : ''}`}>{whenDue(bill.due)}</span>}
          {credit && <span className="tag down">Credit</span>}
          {bill.job && <span className="tag">{bill.job}</span>}
        </div>
      </div>
      {pending?.flag && <span className={`tag ${pending.flag.kind === 'duplicate' ? 'warn' : 'up'}`} style={{ height: 'auto', padding: '8px 10px', fontSize: 14, lineHeight: 1.35 }}>{pending.flag.text}</span>}
      <div className="card" style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row k="Dated" v={dayLabel(bill.issued)} />
        <Row k="Due" v={dayLabel(bill.due)} />
        {bill.ref && <Row k="Invoice" v={bill.ref} />}
        {pending && <Row k="Read" v={`${pending.confidence}% sure`} />}
      </div>
      {photo && <img className="photo-thumb" src={photo} alt="Docket photo" style={{ maxHeight: 360, objectFit: 'contain', background: 'var(--bg)' }} />}
      {pending ? (
        <button className="btn btn-primary btn-block" onClick={onConfirm}>Confirm bill</button>
      ) : (
        <>
          <button className={`btn btn-block ${paid ? 'btn-secondary' : 'btn-primary'}`} onClick={onPay}>
            <Icon name="check" size={20} />{paid ? 'Mark as not paid' : credit ? 'Mark as used' : 'Mark as paid'}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onEdit}><Icon name="edit" size={18} />Edit</button>
            {confirmDelete
              ? <button className="btn btn-danger" style={{ flex: 1 }} onClick={onDelete}>Delete for good</button>
              : <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={18} />Delete</button>}
          </div>
        </>
      )}
    </Sheet>
  );
}

function Row({ k, v }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="muted">{k}</span><span className="num" style={{ fontWeight: 700 }}>{v}</span></div>;
}

// ---------------------------------------------------------------------------
// Add / edit a supplier
// ---------------------------------------------------------------------------
export function SupplierForm({ data, supplier, onClose, onSave }) {
  const [f, setF] = useState({ name: '', terms: '30 days EOM', rep: '', phone: '', account: '', branch: '', ...(supplier || {}) });
  const [error, setError] = useState('');
  const set = (k) => (e) => { setError(''); setF((x) => ({ ...x, [k]: e.target.value })); };
  const save = async () => {
    const name = f.name.trim();
    if (!name) return setError('Give the supplier a name.');
    if (data.suppliers.some((s) => s.id !== supplier?.id && s.name.toLowerCase() === name.toLowerCase())) return setError(`${name} is already in your list.`);
    onSave({ ...f, name, id: supplier?.id || newId() }, !supplier);
  };
  return (
    <Sheet title={supplier ? `Edit ${supplier.name}` : 'Add a supplier'} onClose={onClose}>
      <label className="field"><span className="label">Name</span><input className="input" value={f.name} onChange={set('name')} placeholder="e.g. Reece Dandenong" autoFocus={!supplier} /></label>
      <div className="field">
        <span className="label">Their terms</span>
        <div className="chips">{TERMS.map((t) => <button key={t} className="chip" aria-pressed={f.terms === t} onClick={() => setF((x) => ({ ...x, terms: t }))}>{t}</button>)}</div>
      </div>
      <label className="field"><span className="label">Rep (optional)</span><input className="input" value={f.rep} onChange={set('rep')} placeholder="Who you deal with" /></label>
      <label className="field"><span className="label">Phone (optional)</span><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
      <label className="field"><span className="label">Account no. (optional)</span><input className="input" value={f.account} onChange={set('account')} autoComplete="off" /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block" onClick={save}>{supplier ? 'Save' : 'Add supplier'}</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Try a buy: what a purchase does before you make it
// ---------------------------------------------------------------------------
export function TryBuy({ data, onClose, onAdd }) {
  const [supplierId, setSupplierId] = useState(data.suppliers[0]?.id);
  const [amount, setAmount] = useState('');
  const sup = data.suppliers.find((s) => s.id === supplierId);
  const n = Number(amount) || 0;
  const p = useMemo(() => (sup && n > 0 ? previewPurchase(data.bills, { supplierId, amount: n, terms: sup.terms || '30 days EOM' }) : null), [data.bills, supplierId, n, sup]);
  return (
    <Sheet title="Try a buy" onClose={onClose}>
      <SupplierChips suppliers={data.suppliers} value={supplierId} onChange={setSupplierId} />
      <label className="money-input num">
        <span>$</span>
        <input aria-label="How much" inputMode="decimal" placeholder="0" value={amount} autoFocus onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
      </label>
      {p ? (
        <>
          <div className="tiles">
            <div className="tile" style={{ background: 'var(--bg)', minHeight: 100 }}>
              <span className="tile-k">You'd pay it</span>
              <span className="tile-v" style={{ fontSize: 20 }}>{dayLabel(p.due)}</span>
              <span className="tile-sub muted">{sup.terms} · {p.due === 0 ? 'on the spot' : `${p.due} days away`}</span>
            </div>
            <div className="tile" style={{ background: 'var(--bg)', minHeight: 100 }}>
              <span className="tile-k">You'd owe</span>
              <span className="tile-v num" style={{ fontSize: 22 }}>{kfmt(p.owedAfter)}</span>
              <span className="tile-sub muted num">from {kfmt(p.owedBefore)}</span>
            </div>
          </div>
          <div className="card" style={{ background: 'var(--bg)' }}>
            <div className="tile-k">Bill shock</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <span className="num" style={{ fontSize: 30, fontWeight: 800 }}>{p.before.score}</span>
              <Icon name="chevron" size={22} style={{ color: 'var(--muted)' }} />
              <span className={`num ${p.after.score >= 60 ? 'up' : ''}`} style={{ fontSize: 30, fontWeight: 800 }}>{p.after.score}</span>
              <span className={`pill ${p.after.score >= 60 ? 'up' : 'flat'}`}>{p.after.label}</span>
            </div>
            <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
              {p.due > 30 ? 'Lands outside the next 30 days — no hit to this month.' : p.after.score - p.before.score >= 5 ? 'This makes the next month noticeably heavier.' : 'Barely moves your month.'}
            </p>
          </div>
          <button className="btn btn-primary btn-block" onClick={() => onAdd({ supplierId, amount: n })}>Bought it — add the bill</button>
        </>
      ) : (
        <p className="muted">Pick the supplier, punch in the price — see when you'd pay it and what it does to your month.</p>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// A price you watch
// ---------------------------------------------------------------------------
export function ItemSheet({ data, itemId, onClose, onAlert }) {
  const it = data.items.find((x) => x.id === itemId);
  const prices = Object.entries(it.latest).sort((a, b) => a[1] - b[1]);
  const best = prices[0][1], worst = prices.at(-1)[1];
  const saved = data.alerts[it.id];
  const [at, setAt] = useState(saved?.at ?? Math.ceil(worst * 1.05));
  const on = !!saved?.on;
  const ch = itemChange(it);
  const name = (id) => data.suppliers.find((s) => s.id === id)?.name ?? id;
  return (
    <Sheet title={it.name.split(' · ')[0]} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="num" style={{ fontSize: 36, fontWeight: 800 }}>{money(it.history.at(-1))}</span>
        <span className={`pill num ${dirClass(ch)}`}>{pct(ch)}</span>
      </div>
      <PriceSteps values={it.history} tone={dirClass(ch)} width={354} height={90} />
      <div className="card" style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {prices.map(([id, p]) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 110, fontWeight: 600 }}>{name(id)}</div>
            <div className="bar-track" style={{ flex: 1 }}><div style={{ height: '100%', borderRadius: 4, width: `${(p / worst) * 100}%`, background: p === best ? 'var(--down)' : 'var(--line-2)' }} /></div>
            <div className={`num ${p === best ? 'down' : ''}`} style={{ width: 76, textAlign: 'right', fontWeight: 700 }}>{money(p)}</div>
          </div>
        ))}
      </div>
      <div className="field">
        <label htmlFor="alert-at" className="label" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tell me if anyone charges over</span><b className="num" style={{ color: 'var(--text)' }}>{money(at)}</b></label>
        <input id="alert-at" type="range" min={Math.floor(best * 0.9)} max={Math.ceil(worst * 1.15)} step={worst > 100 ? 1 : worst > 20 ? 0.5 : 0.1} value={at} onChange={(e) => setAt(Number(e.target.value))} />
      </div>
      {on && at !== saved.at
        ? <button className="btn btn-primary btn-block" onClick={() => onAlert(it, at, true)}>Update alert</button>
        : <button className={`btn btn-block ${on ? 'btn-secondary' : 'btn-primary'}`} onClick={() => onAlert(it, at, !on)}><Icon name="bell" size={18} />{on ? 'Turn alert off' : 'Set alert'}</button>}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
export function AccountSheet({ data, onClose, onUseSample, theme, onTheme, account, onSignIn, onProfile }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.business.forwardAddress); toast('Address copied'); } catch { toast('Press and hold the address to copy'); }
  };
  const look = (
    <div className="field">
      <span className="label">Look</span>
      <div className="seg" role="tablist" aria-label="Look">
        {[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match phone']].map(([k, l]) => <button key={k} role="tab" aria-selected={theme === k} onClick={() => onTheme(k)}>{l}</button>)}
      </div>
      <span className="muted" style={{ fontSize: 13 }}>Light reads best in full sun.</span>
    </div>
  );

  if (account) {
    return (
      <Sheet title="Account" onClose={onClose}>
        <PlanCard access={account.access} />
        <BusinessFields business={data.business} onSave={onProfile} />
        {look}
        <div className="card" style={{ background: 'var(--bg)' }}>
          <div className="label">Forward bills to</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>Coming soon</div>
          <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>Your own address for supplier emails, so bills add themselves.</p>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>Signed in as {account.email}</div>
        <button className="btn btn-secondary btn-block" onClick={account.signOut}>Sign out</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Account" onClose={onClose}>
      {onSignIn && (
        <div className="card" style={{ background: 'var(--bg)' }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Keep your bills safe</div>
          <p className="muted" style={{ marginTop: 6 }}>Sign in to back them up and see them on every device. 14 days free.</p>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={onSignIn}>Sign in or sign up</button>
        </div>
      )}
      {look}
      <div className="card" style={{ background: 'var(--bg)' }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{data.useSample ? 'Showing sample data' : 'Your own data'}</div>
        <p className="muted" style={{ marginTop: 6 }}>{data.useSample ? 'Have a play. When you\'re ready, start fresh and add your real bills.' : 'Everything you add stays on this phone.'}</p>
        {confirm ? (
          <button className="btn btn-danger btn-block" style={{ marginTop: 14 }} onClick={() => onUseSample(!data.useSample)}>
            {data.useSample ? 'Yes — clear it and start fresh' : 'Yes — wipe my bills, show sample'}
          </button>
        ) : (
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => setConfirm(true)}>
            {data.useSample ? 'Start with my own bills' : 'Go back to sample data'}
          </button>
        )}
      </div>
    </Sheet>
  );
}

function PlanCard({ access }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const go = async (what, fn) => {
    setBusy(what);
    try { await fn(); } catch (err) { console.error('[billing]', err); toast(err.message || 'Billing is unavailable right now.'); setBusy(''); }
  };
  if (!access) return <div className="card" style={{ background: 'var(--bg)' }}><div className="muted">Checking your plan…</div></div>;
  const paid = ['active', 'trialing', 'past_due', 'unpaid'].includes(access.subscription_status);
  const left = daysLeft(access.trial_ends_at);
  const title = access.subscription_status === 'grandfathered' ? 'Free for life'
    : access.subscription_status === 'active' || access.subscription_status === 'trialing' ? 'Subscribed'
    : access.subscription_status === 'past_due' || access.subscription_status === 'unpaid' ? 'Payment didn’t go through'
    : access.trial_active ? `Free trial · ${left} day${left === 1 ? '' : 's'} left`
    : 'Free trial ended';
  return (
    <div className="card" style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div className="label">Your plan</div>
        <div style={{ fontWeight: 800, fontSize: 19, marginTop: 4 }}>{title}</div>
        {!access.has_access && <p className="muted" style={{ marginTop: 4 }}>You can still see everything. Subscribe to keep adding bills.</p>}
      </div>
      {access.subscription_status === 'grandfathered' ? null : paid ? (
        <button className="btn btn-secondary btn-block" disabled={!!busy} onClick={() => go('portal', openBillingPortal)}>{busy ? 'Opening…' : 'Manage billing'}</button>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} disabled={!!busy} onClick={() => go('month', () => startCheckout('month'))}>{busy === 'month' ? 'Opening…' : 'Monthly'}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={!!busy} onClick={() => go('year', () => startCheckout('year'))}>{busy === 'year' ? 'Opening…' : 'Yearly'}</button>
        </div>
      )}
    </div>
  );
}

function BusinessFields({ business, onSave }) {
  const [owner, setOwner] = useState(business.owner || '');
  const [name, setName] = useState(business.name === 'Your business' ? '' : business.name || '');
  const changed = owner !== (business.owner || '') || name !== (business.name === 'Your business' ? '' : business.name || '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label className="field"><span className="label">Your name</span>
        <input className="input" value={owner} maxLength={120} autoComplete="name" onChange={(e) => setOwner(e.target.value)} /></label>
      <label className="field"><span className="label">Business name</span>
        <input className="input" value={name} maxLength={160} autoComplete="organization" onChange={(e) => setName(e.target.value)} /></label>
      {changed && <button className="btn btn-primary btn-block" onClick={() => onSave({ owner: owner.trim(), name: name.trim() })}>Save</button>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispute something Watchdog caught: a ready-to-send message to the rep
// ---------------------------------------------------------------------------
export function DisputeSheet({ data, c, onClose, onSent }) {
  const toast = useToast();
  const sup = data.suppliers.find((s) => s.id === c.supplierId);
  const nameOf = (id) => data.suppliers.find((s) => s.id === id)?.name || id;
  const hi = sup?.rep && sup.rep !== 'Trade desk' ? `Hi ${sup.rep.split(' ')[0]},` : 'Hi,';
  const body = c.kind === 'price'
    ? `${hi}\n\nOn my account ${sup?.account || ''} I'm being charged ${money(c.mine)} for ${c.item.name}. I've been billed ${money(c.best)} for the same item elsewhere. Can you match ${money(c.best)} and credit the difference on recent invoices?\n\nThanks,\n${data.business.owner}\n${data.business.name}`
    : `${hi}\n\nInvoice ${c.b.ref || ''} for ${money(c.b.total)} looks like a duplicate of ${c.a.ref || 'an earlier invoice'} (same amount, a few days apart). Can you check and cancel one of them?\n\nThanks,\n${data.business.owner}\n${data.business.name}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(body); toast('Message copied — paste it into an email or text'); }
    catch { toast('Press and hold the message to copy it'); }
  };
  return (
    <Sheet title={c.kind === 'price' ? 'Ask for your price' : 'Query a double bill'} onClose={onClose}>
      <div className="card" style={{ background: 'var(--card-2)', boxShadow: 'none' }}>
        <div className="label">To</div>
        <div style={{ fontWeight: 700, marginTop: 4 }}>{sup?.rep || nameOf(c.supplierId)}{sup?.phone ? ` · ${sup.phone}` : ''}</div>
      </div>
      <div className="card" style={{ background: 'var(--card-2)', boxShadow: 'none', whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.5, userSelect: 'text' }}>{body}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={copy}><Icon name="copy" size={18} />Copy</button>
        <button className="btn btn-primary" style={{ flex: 1.3 }} onClick={onSent}><Icon name="check" size={18} />I've sent it</button>
      </div>
    </Sheet>
  );
}
