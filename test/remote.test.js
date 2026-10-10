import { describe, expect, it, vi } from 'vitest';
import { billFromRow, billToRow, businessFromProfile, dealFromRow, dealToRow, remoteReducer, saveError, supplierFromRow, supplierToRow, writeAction } from '../src/lib/remote.js';
import { derive, emptyState, isoFromOffset } from '../src/lib/store.js';
import { matchSupplier } from '../src/lib/match.js';

const UID = '11111111-1111-1111-1111-111111111111';

/** A stand-in Supabase client that records every call and can be told to fail. */
function fakeClient({ fail = null } = {}) {
  const calls = [];
  const result = () => Promise.resolve(fail ? { data: null, error: fail } : { data: null, error: null });
  const chain = (table, op, payload) => {
    const entry = { table, op, payload, eq: [] };
    calls.push(entry);
    const c = { eq: (k, v) => { entry.eq.push([k, v]); return c; }, then: (res, rej) => result().then(res, rej) };
    return c;
  };
  return {
    calls,
    from: (table) => ({
      upsert: (p) => chain(table, 'upsert', p), insert: (p) => chain(table, 'insert', p),
      update: (p) => chain(table, 'update', p), delete: () => chain(table, 'delete'),
    }),
    storage: { from: (bucket) => ({
      upload: vi.fn(async (path) => { calls.push({ bucket, op: 'upload', path }); return { data: {}, error: null }; }),
      remove: vi.fn(async (paths) => { calls.push({ bucket, op: 'remove', paths }); return { data: {}, error: null }; }),
    }) },
  };
}

const remoteState = (over = {}) => ({ ...emptyState, useSample: false, alerts: {}, business: { name: 'Site Crew', owner: 'Mick', initials: 'M', forwardAddress: '' }, ...over });
const bill = (over = {}) => ({ id: 'bbbbbbbb-0000-0000-0000-000000000001', supplierId: 'aaaaaaaa-0000-0000-0000-000000000001', ref: 'INV-1', total: 1284.5, issued: isoFromOffset(-1), due: isoFromOffset(29), paid: null, job: 'Smith reno', photo: false, ...over });

describe('database rows ↔ app records', () => {
  it('round-trips bills, suppliers and deals without losing anything', () => {
    const b = bill({ photoPath: `${UID}/x.jpg`, status: 'confirmed', confidence: 92 });
    expect(billFromRow({ ...billToRow(b, UID), total: '1284.50' })).toMatchObject({ ...b, photo: true });
    const s = { id: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Reece', terms: 'COD', rep: 'Dave', phone: '03 9421 7780', account: 'RE-1', branch: 'Dandenong', limit: 10000 };
    expect(supplierFromRow(supplierToRow(s, UID))).toEqual(s);
    const d = { id: 'd1', supplierId: s.id, kind: 'spend', target: 5000, reward: '$200 credit', rep: 'Dave', startIso: '2026-10-09', endIso: '2026-10-31', signatures: { you: 'M1 1', rep: 'M2 2' }, signedAt: '2026-10-09T01:00:00Z' };
    expect(dealFromRow({ ...dealToRow(d, UID), target: '5000.00' })).toEqual(d);
  });

  it('always writes the signed-in user as the owner and blanks to null', () => {
    expect(billToRow(bill({ ref: '  ', job: '' }), UID)).toMatchObject({ user_id: UID, ref: null, job: null, status: 'confirmed', source: 'manual' });
  });

  it('builds the business details from the profile', () => {
    expect(businessFromProfile({ owner_name: 'Mick Tucker', business_name: 'Site Crew' }, 'm@x.com')).toMatchObject({ name: 'Site Crew', owner: 'Mick Tucker', initials: 'MT' });
    expect(businessFromProfile(null, 'jo@x.com')).toMatchObject({ name: 'Your business', owner: '', initials: 'JX' });
  });
});

describe('saving to the database', () => {
  it('a new bill with a photo uploads it to the owner’s folder first, then saves the bill pointing at it', async () => {
    const sb = fakeClient();
    const applied = await writeAction(sb, UID, { type: 'saveBill', bill: bill(), isNew: true, photo: 'data:image/jpeg;base64,/9j/2Q==' }, remoteState());
    expect(sb.calls[0]).toMatchObject({ bucket: 'dockets', op: 'upload', path: `${UID}/${bill().id}.jpg` });
    expect(sb.calls[1]).toMatchObject({ table: 'bills', op: 'upsert', payload: { user_id: UID, photo_path: `${UID}/${bill().id}.jpg`, source: 'photo' } });
    expect(applied.bill).toMatchObject({ photo: true, photoPath: `${UID}/${bill().id}.jpg` });
  });

  it('editing without touching the photo keeps it; removing it deletes the file', async () => {
    const withPhoto = bill({ photo: true, photoPath: `${UID}/old.jpg` });
    let sb = fakeClient();
    await writeAction(sb, UID, { type: 'saveBill', bill: { ...withPhoto, total: 99 }, isNew: false, photo: undefined }, remoteState({ bills: [withPhoto] }));
    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0].payload).toMatchObject({ total: 99, photo_path: `${UID}/old.jpg` });
    sb = fakeClient();
    await writeAction(sb, UID, { type: 'saveBill', bill: withPhoto, isNew: false, photo: null }, remoteState({ bills: [withPhoto] }));
    expect(sb.calls[0]).toMatchObject({ op: 'remove', paths: [`${UID}/old.jpg`] });
    expect(sb.calls[1].payload.photo_path).toBeNull();
  });

  it('marks paid with today’s date, on that one bill', async () => {
    const sb = fakeClient();
    const applied = await writeAction(sb, UID, { type: 'pay', id: 'b1', on: true }, remoteState());
    expect(sb.calls[0]).toMatchObject({ table: 'bills', op: 'update', eq: [['id', 'b1']] });
    expect(applied.paid).toBe(isoFromOffset(0));
  });

  it('never saves the counter-mode hide, and refuses on-phone-only actions', async () => {
    const sb = fakeClient();
    await writeAction(sb, UID, { type: 'hide', id: 'reece' }, remoteState());
    expect(sb.calls).toHaveLength(0);
    await expect(writeAction(sb, UID, { type: 'useSample', on: true }, remoteState())).rejects.toThrow();
  });

  it('a refused write throws, so the screen never shows it as saved', async () => {
    const sb = fakeClient({ fail: { code: '42501', message: 'WATCHDOG_READ_ONLY' } });
    await expect(writeAction(sb, UID, { type: 'pay', id: 'b1', on: true }, remoteState())).rejects.toBeTruthy();
  });

  it('explains failures in plain words', () => {
    expect(saveError({ code: '42501', message: 'WATCHDOG_READ_ONLY' })).toMatch(/trial has ended/);
    expect(saveError({ code: '23505', message: 'duplicate key value violates unique constraint "bills_user_supplier_ref_idx"' })).toMatch(/invoice number/);
    expect(saveError({ code: '23505', message: 'duplicate key value violates unique constraint "suppliers_user_name_idx"' })).toMatch(/supplier with that name/);
    expect(saveError(new TypeError('Failed to fetch'))).toMatch(/No connection/);
  });
});

describe('signed-in screen state', () => {
  it('pending bills show in the queue until confirmed, then count as owed', () => {
    const p = bill({ status: 'pending', confidence: 88 });
    let s = remoteState({ pending: [p] });
    expect(derive(s).queue.map((q) => q.id)).toEqual([p.id]);
    expect(derive(s).bills).toHaveLength(0);
    s = remoteReducer(s, { type: 'confirm', id: p.id });
    expect(derive(s).queue).toHaveLength(0);
    expect(derive(s).bills[0]).toMatchObject({ id: p.id, issued: -1, due: 29, paid: null });
  });

  it('applies saves, payments and deletes', () => {
    let s = remoteReducer(remoteState(), { type: 'saveBill', bill: bill(), isNew: true });
    s = remoteReducer(s, { type: 'remotePay', id: bill().id, paid: isoFromOffset(0) });
    expect(derive(s).bills[0].paid).toBe(0);
    s = remoteReducer(s, { type: 'saveBill', bill: { ...s.bills[0], total: 10 } });
    expect(s.bills).toHaveLength(1);
    expect(derive(remoteReducer(s, { type: 'remoteDelete', id: bill().id })).bills).toHaveLength(0);
  });

  it('shows the account’s own business, never the sample one', () => {
    expect(derive(remoteState()).business.name).toBe('Site Crew');
    expect(derive(remoteState()).suppliers).toEqual([]);
  });
});

describe('matching the supplier read off a bill', () => {
  const sups = [{ id: 'r', name: 'Reece' }, { id: 't', name: 'Tradelink' }, { id: 'b', name: 'Bunnings Trade' }, { id: 'm', name: 'Middys' }];
  it('ignores Pty Ltd and similar', () => {
    expect(matchSupplier('REECE AUSTRALIA PTY LTD', sups)?.id).toBe('r');
    expect(matchSupplier('Tradelink Plumbing Supplies', sups)?.id).toBe('t');
    expect(matchSupplier('Bunnings Group Limited', sups)?.id).toBe('b');
    expect(matchSupplier("Middy's Electrical", sups)?.id).toBe('m');
    expect(matchSupplier('Rexel Electrical', sups)).toBeNull();
    expect(matchSupplier('', sups)).toBeNull();
  });
});
