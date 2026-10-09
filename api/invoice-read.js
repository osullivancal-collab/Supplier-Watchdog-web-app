// POST /api/invoice-read — "Snap a docket": 1–3 photos of one bill in, the
// fields read off it out. Nothing is saved here: the app shows what was read,
// the tradie confirms or fixes it, and the app saves it under their own login
// (so row-level security applies to the write).
//
// Same guard order as SoleTasker's api/workorder.js: signed in → has a live
// trial or plan → feature switched on → body size → real image bytes → rate
// limit + monthly allowance → AI → plain-code checks.

import { businessForUserId, requireActiveAccess, requireAuth } from './_auth.js';
import { featureEnabled, finishAction, readJsonBody, rejectReservation, reserveAction, sendError } from './_security.js';
import { decodeImageDataUrl } from './_validation.js';
import { checkInvoice, extractInvoice, INVOICE_MODEL } from './_invoice-extract.js';

const MAX_PAGES = 3;
// Vercel refuses request bodies over 4.5 MB, and base64 adds a third. The app
// shrinks photos to ~1000px JPEG (~150 KB) before sending, so this is roomy.
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 30000;
const monthlyAllowance = () => Number(process.env.INVOICE_READ_MONTHLY_ALLOWANCE) || 300;

const sydneyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!(await requireActiveAccess(user, res))) return;
  if (!featureEnabled('INVOICE_READ_ENABLED') || !process.env.OPENAI_API_KEY) return sendError(res, 503, 'FEATURE_DISABLED');

  let body;
  try { body = await readJsonBody(req, MAX_BODY_BYTES); }
  catch (error) { return sendError(res, error.status || 400, error.code || 'INVALID_REQUEST'); }

  let content;
  let inputBytes = 0;
  let pages = 0;
  if (body?.type === 'text') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_TEXT_CHARS) return sendError(res, 400, 'INVALID_REQUEST', 'Paste between 1 and 30,000 characters.');
    inputBytes = Buffer.byteLength(text);
    content = `Supplier bill text:\n\n${text}`;
  } else if (body?.type === 'images') {
    const list = Array.isArray(body.images) ? body.images : null;
    if (!list || list.length < 1 || list.length > MAX_PAGES) return sendError(res, 400, 'INVALID_REQUEST', `Send 1 to ${MAX_PAGES} photos of one bill.`);
    const urls = [];
    for (const page of list) {
      const decoded = typeof page === 'string' ? decodeImageDataUrl(page, MAX_IMAGE_BYTES) : null;
      if (!decoded) return sendError(res, 415, 'INVALID_FILE', 'Use JPEG, PNG or WebP photos under 1 MB each.');
      urls.push(`data:${decoded.mime};base64,${decoded.buffer.toString('base64')}`);
      inputBytes += decoded.buffer.length;
    }
    pages = urls.length;
    content = [
      ...urls.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
      { type: 'text', text: pages > 1 ? `These ${pages} photos are consecutive pages of ONE bill. Read them together; list each line once.` : 'Read this supplier bill.' },
    ];
  } else {
    return sendError(res, 400, 'INVALID_REQUEST', 'Send photos or text of a bill.');
  }

  const reservation = await reserveAction({
    action: 'invoice_read', userId: user.id, scope: `user:${user.id}`, req, inputBytes,
    periodKey: new Date().toISOString().slice(0, 7), periodLimit: monthlyAllowance(),
    metadata: { input_type: body.type, model: INVOICE_MODEL, ...(pages > 1 ? { pages } : {}) },
  });
  if (!reservation.allowed) return rejectReservation(res, reservation);
  const started = Date.now();

  try {
    const buyer = await businessForUserId(user.id);
    const read = await extractInvoice(content, { buyer });
    const checked = checkInvoice(read.result, sydneyToday());
    await finishAction(reservation.event_id, {
      state: 'succeeded', provider: 'openai', providerRequestId: read.providerRequestId,
      inputUnits: read.inputTokens, outputUnits: read.outputTokens, estimatedCostUsd: read.estimatedCostUsd, durationMs: Date.now() - started,
    });
    return res.status(200).json(checked);
  } catch (error) {
    const category = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'provider_timeout' : 'parse_failure';
    await finishAction(reservation.event_id, { state: 'failed', errorCategory: category, provider: 'openai', durationMs: Date.now() - started });
    console.error('[invoice-read] failed', { category, status: error.providerStatus || null });
    return sendError(res, 503, 'PROVIDER_UNAVAILABLE', 'Couldn’t read that bill right now. Try again, or type it in.');
  }
}
