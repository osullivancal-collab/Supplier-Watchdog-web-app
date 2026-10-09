// Stripe tells us when someone subscribes, pays, fails to pay or cancels.
// Adapted from SoleTasker api/stripe/webhook.js: same signature check, same
// claim-once de-duplication, same event handling. Differences: it writes the
// locked account_billing table instead of profiles, and the "payment failed /
// access restored" emails are left out until Watchdog has an email sender.
import crypto from "crypto";
import { billingForCustomer, updateBilling } from "../_billing.js";
import { claimWebhook, finishWebhook, readRawBody, sendError } from "../_security.js";

export const config = { api: { bodyParser: false } };

const RELEVANT_EVENTS = new Set([
  "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
  "customer.subscription.deleted", "invoice.payment_succeeded", "invoice.payment_failed",
]);

export function verifyStripeSignature(body, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!signatureHeader || !secret) return false;
  const parts = String(signatureHeader).split(",");
  const timestamp = Number(parts.find(part => part.startsWith("t="))?.slice(2));
  const signatures = parts.filter(part => part.startsWith("v1=")).map(part => part.slice(3));
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !signatures.length) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return signatures.some(value => {
    if (!/^[a-f0-9]{64}$/i.test(value)) return false;
    const candidate = Buffer.from(value, "hex");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

/** What to write for one Stripe event. Pure, so it can be tested without Stripe. */
export async function applyEvent(event, { forCustomer = billingForCustomer, update = updateBilling } = {}) {
  const object = event.data.object;
  if (event.type === "checkout.session.completed") {
    const userId = object.client_reference_id || object.metadata?.user_id;
    return update(userId, { stripe_customer_id: object.customer, stripe_subscription_id: object.subscription, subscription_status: "active" });
  }
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const row = await forCustomer(object.customer);
    return update(row.user_id, { subscription_status: object.status, stripe_subscription_id: object.id });
  }
  if (event.type === "customer.subscription.deleted") {
    const row = await forCustomer(object.customer);
    return update(row.user_id, { subscription_status: "canceled" });
  }
  if (event.type === "invoice.payment_failed") {
    const row = await forCustomer(object.customer);
    return update(row.user_id, { subscription_status: "past_due" });
  }
  if (event.type === "invoice.payment_succeeded") {
    const row = await forCustomer(object.customer);
    if (row.subscription_status === "past_due" || row.subscription_status === "unpaid") {
      return update(row.user_id, { subscription_status: "active" });
    }
  }
  return undefined;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  const { STRIPE_WEBHOOK_SECRET } = process.env;
  if (!STRIPE_WEBHOOK_SECRET) return sendError(res, 503, "FEATURE_DISABLED", "Webhook is not configured.");

  let rawBody;
  try { rawBody = (await readRawBody(req, 1024 * 1024)).toString("utf8"); }
  catch (error) { return sendError(res, error.status || 400, error.code || "INVALID_REQUEST"); }
  if (!verifyStripeSignature(rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET)) {
    console.error("[stripe/webhook] rejected", { category: "invalid_signature" });
    return sendError(res, 400, "INVALID_SIGNATURE", "Invalid webhook signature.");
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return sendError(res, 400, "INVALID_REQUEST", "Invalid webhook payload."); }
  if (!event?.id || !event?.type || !event?.data?.object) return sendError(res, 400, "INVALID_REQUEST", "Invalid webhook payload.");
  if (!RELEVANT_EVENTS.has(event.type)) return res.status(200).json({ received: true });

  let claim;
  try { claim = await claimWebhook("stripe", event.id, event.type, 120); }
  catch {
    console.error("[stripe/webhook] claim failed", { category: "control_unavailable" });
    return sendError(res, 503, "SECURITY_CONTROL_UNAVAILABLE");
  }
  if (!claim.claimed) return res.status(200).json({ received: true, duplicate: true });

  try {
    await applyEvent(event);
    await finishWebhook(claim.event_id, true);
    return res.status(200).json({ received: true });
  } catch {
    try { await finishWebhook(claim.event_id, false, "processing_failure"); } catch { /* Stripe will retry; its retry is the source of truth. */ }
    console.error("[stripe/webhook] processing failed", { category: "processing_failure", event_type: event.type });
    return sendError(res, 500, "WEBHOOK_PROCESSING_FAILED", "Webhook processing failed.");
  }
}
