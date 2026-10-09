import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appOrigin } from '../api/_origin.js';
import { hasLiveSubscription } from '../api/_billing.js';
import { actionConfig } from '../api/_security.js';
import { checkInvoice, validateInvoiceResult } from '../api/_invoice-extract.js';
import { applyEvent, verifyStripeSignature } from '../api/stripe/webhook.js';
import invoiceRead from '../api/invoice-read.js';

const reading = (over = {}) => ({
  document_type: 'invoice', supplier_name: 'Reece', supplier_abn: '12 345 678 901', invoice_number: 'INV-88342',
  issued_on: '2026-10-08', due_on: '2026-11-30', payment_terms: '30 days EOM', total_inc_gst: 1284.5, gst: 116.77,
  job_reference: 'Smith reno',
  lines: [
    { sku: 'TPS25', description: 'TPS 2.5mm 2C+E 100m', qty: 5, unit: 'roll', unit_price: 142, line_total: 710 },
    { sku: 'CT15', description: 'Copper tube 15mm 5.5m', qty: 7, unit: 'len', unit_price: 65.39, line_total: 457.73 },
  ],
  ...over,
});

describe('invoice reader checks (plain code, no AI)', () => {
  it('accepts a well-formed reading and rejects extra or missing fields', () => {
    expect(validateInvoiceResult(reading())).toBe(true);
    expect(validateInvoiceResult({ ...reading(), sneaky: 1 })).toBe(false);
    const { gst, ...missing } = reading();
    expect(validateInvoiceResult(missing)).toBe(false);
    expect(validateInvoiceResult(reading({ issued_on: '2026-02-30' }))).toBe(false);
    expect(validateInvoiceResult(reading({ total_inc_gst: '1284.50' }))).toBe(false);
  });

  it('a clean bill has no flags and full confidence', () => {
    const out = checkInvoice(reading(), '2026-10-09');
    expect(out.flags).toEqual([]);
    expect(out.confidence).toBe(100);
    expect(out.bill).toMatchObject({ kind: 'bill', total: 1284.5, gst: 116.77, ref: 'INV-88342', supplierAbn: '12345678901', job: 'Smith reno' });
    expect(out.bill.lines[1]).toMatchObject({ position: 1, unitPrice: 65.39, lineTotal: 457.73 });
  });

  it('credit notes become negative totals', () => {
    expect(checkInvoice(reading({ document_type: 'credit_note', total_inc_gst: 220, gst: 20, lines: [] }), '2026-10-09').bill).toMatchObject({ kind: 'credit', total: -220 });
  });

  it('flags lines that do not add up, odd GST, statements and a due date before the invoice', () => {
    const kinds = (r) => checkInvoice(r, '2026-10-09').flags.map((f) => f.kind);
    expect(kinds(reading({ total_inc_gst: 2000, gst: 181.82 }))).toContain('lines_dont_add_up');
    expect(kinds(reading({ gst: 50 }))).toContain('gst_odd');
    expect(kinds(reading({ document_type: 'statement' }))).toContain('statement');
    const early = checkInvoice(reading({ due_on: '2026-10-01' }), '2026-10-09');
    expect(early.flags.map((f) => f.kind)).toContain('due_before_issued');
    expect(early.bill.dueOn).toBeNull();
    expect(kinds(reading({ total_inc_gst: null }))).toContain('no_total');
    expect(checkInvoice(reading({ total_inc_gst: null, supplier_name: null }), '2026-10-09').confidence).toBeLessThan(50);
  });

  it('catches a line whose qty × price is wrong', () => {
    const r = reading();
    r.lines[0] = { ...r.lines[0], line_total: 900 };
    expect(checkInvoice(r, '2026-10-09').flags.map((f) => f.kind)).toContain('line_maths');
  });
});

describe('Stripe', () => {
  const secret = 'whsec_test';
  const sign = (body, t) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

  it('accepts a correctly signed, fresh webhook and rejects tampered or stale ones', () => {
    const now = 1_800_000_000;
    const body = '{"id":"evt_1"}';
    expect(verifyStripeSignature(body, sign(body, now), secret, now)).toBe(true);
    expect(verifyStripeSignature(body + ' ', sign(body, now), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now - 301), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now), 'whsec_other', now)).toBe(false);
    expect(verifyStripeSignature(body, '', secret, now)).toBe(false);
  });

  it('turns events into billing changes on the right account', async () => {
    const update = vi.fn();
    const forCustomer = vi.fn(async () => ({ user_id: 'u1', subscription_status: 'past_due' }));
    await applyEvent({ type: 'checkout.session.completed', data: { object: { client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' } } }, { update, forCustomer });
    expect(update).toHaveBeenLastCalledWith('u1', { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', subscription_status: 'active' });
    await applyEvent({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } }, { update, forCustomer });
    expect(update).toHaveBeenLastCalledWith('u1', { subscription_status: 'past_due' });
    await applyEvent({ type: 'invoice.payment_succeeded', data: { object: { customer: 'cus_1' } } }, { update, forCustomer });
    expect(update).toHaveBeenLastCalledWith('u1', { subscription_status: 'active' });
    await applyEvent({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1' } } }, { update, forCustomer });
    expect(update).toHaveBeenLastCalledWith('u1', { subscription_status: 'canceled' });
  });

  it('treats only cancelled / expired subscriptions as gone', () => {
    expect(hasLiveSubscription([{ status: 'canceled' }, { status: 'incomplete_expired' }])).toBe(false);
    expect(hasLiveSubscription([{ status: 'canceled' }, { status: 'past_due' }])).toBe(true);
    expect(hasLiveSubscription(null)).toBe(false);
  });

  it('sends previews back to the preview, production to the real address', () => {
    expect(appOrigin({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'wd-git-x.vercel.app', APP_URL: 'https://watchdog.app' })).toBe('https://wd-git-x.vercel.app');
    expect(appOrigin({ VERCEL_ENV: 'production', APP_URL: 'https://watchdog.app/' })).toBe('https://watchdog.app');
    expect(appOrigin({})).toBeNull();
  });
});

describe('limits', () => {
  afterEach(() => { delete process.env.INVOICE_READ_BURST_LIMIT; });
  it('can be tuned by env var without a deploy of new code', () => {
    expect(actionConfig('invoice_read').burst).toBe(6);
    process.env.INVOICE_READ_BURST_LIMIT = '2';
    expect(actionConfig('invoice_read').burst).toBe(2);
    expect(() => actionConfig('nope')).toThrow();
  });
});

describe('POST /api/invoice-read', () => {
  const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString('base64')}`;
  let calls;
  let access;
  let openai;

  const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'x-request-id': 'req_1' } });
  const call = async (body, headers = { authorization: 'Bearer good' }) => {
    const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
    await invoiceRead({ method: 'POST', headers, body }, res);
    return res;
  };

  beforeEach(() => {
    Object.assign(process.env, { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', OPENAI_API_KEY: 'sk' });
    calls = [];
    access = { has_access: true };
    openai = () => reply(200, { choices: [{ message: { content: JSON.stringify(reading()) } }], usage: { prompt_tokens: 900, completion_tokens: 300 } });
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const u = String(url);
      calls.push({ url: u, body: init.body ? JSON.parse(init.body) : null });
      if (u.endsWith('/auth/v1/user')) return init.headers.Authorization === 'Bearer good' ? reply(200, { id: 'u1' }) : reply(401, {});
      if (u.endsWith('/rpc/get_subscription_access_for_user')) return reply(200, [access]);
      if (u.endsWith('/rpc/reserve_api_action')) return reply(200, { allowed: true, event_id: 'evt' });
      if (u.endsWith('/rpc/finish_api_action')) return reply(200, '');
      if (u.includes('/rest/v1/profiles')) return reply(200, [{ business_name: 'Site Crew Pty Ltd' }]);
      if (u.startsWith('https://api.openai.com')) return openai();
      throw new Error(`unexpected fetch ${u}`);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('needs a signed-in user', async () => {
    expect((await call({ type: 'images', images: [JPEG] }, {})).code).toBe(401);
    expect((await call({ type: 'images', images: [JPEG] }, { authorization: 'Bearer bad' })).code).toBe(401);
    expect(calls.some((c) => c.url.includes('openai'))).toBe(false);
  });

  it('needs a live trial or plan', async () => {
    access = { has_access: false };
    const res = await call({ type: 'images', images: [JPEG] });
    expect(res.code).toBe(402);
    expect(calls.some((c) => c.url.includes('openai'))).toBe(false);
  });

  it('refuses something that is not really an image', async () => {
    const fake = `data:image/jpeg;base64,${Buffer.from('<script>').toString('base64')}`;
    expect((await call({ type: 'images', images: [fake] })).code).toBe(415);
    expect((await call({ type: 'images', images: [JPEG, JPEG, JPEG, JPEG] })).code).toBe(400);
  });

  it('reads a bill, tells the AI who the buyer is, and records the usage', async () => {
    const res = await call({ type: 'images', images: [JPEG] });
    expect(res.code).toBe(200);
    expect(res.body.bill).toMatchObject({ supplierName: 'Reece', total: 1284.5 });
    const ai = calls.find((c) => c.url.includes('openai')).body;
    expect(ai.messages[0].content).toContain('"Site Crew Pty Ltd"');
    expect(ai.temperature).toBe(0);
    expect(calls.find((c) => c.url.endsWith('/rpc/reserve_api_action')).body).toMatchObject({ p_action: 'invoice_read', p_user_id: 'u1', p_period_limit: 300 });
    expect(calls.find((c) => c.url.endsWith('/rpc/finish_api_action')).body).toMatchObject({ p_state: 'succeeded', p_input_units: 900 });
  });

  it('marks the read failed (so it does not use the allowance) when the AI answer is junk', async () => {
    openai = () => reply(200, { choices: [{ message: { content: '{"total": "lots"}' } }] });
    const res = await call({ type: 'images', images: [JPEG] });
    expect(res.code).toBe(503);
    expect(calls.find((c) => c.url.endsWith('/rpc/finish_api_action')).body).toMatchObject({ p_state: 'failed', p_error_category: 'parse_failure' });
  });
});
