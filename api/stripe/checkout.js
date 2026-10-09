// Starts a Stripe Checkout for the Watchdog subscription.
// Adapted from SoleTasker api/stripe/checkout.js: same double check that the
// account isn't already subscribed (our record, then Stripe itself), same
// idempotency key and limits. Adds a monthly / yearly choice.
import { requireAuth } from "../_auth.js";
import { appOrigin } from "../_origin.js";
import { billingForUser, billingHasLiveSubscription, hasLiveSubscription } from "../_billing.js";
import { providerFetch } from "../_provider.js";
import { finishAction, hashScope, idempotencyKey, readJsonBody, rejectReservation, reserveAction, sendError } from "../_security.js";

async function customerHasLiveSubscription(customerId, secretKey) {
  const response = await providerFetch(
    `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
    { timeoutMs: 15000, maxRetries: 1 },
  );
  if (!response.ok) throw Object.assign(new Error("Stripe subscription check rejected"), { providerStatus: response.status });
  const result = await response.json();
  return hasLiveSubscription(result?.data);
}

async function rejectExistingSubscription(res, eventId) {
  await finishAction(eventId, { state: "released", errorCategory: "subscription_exists", provider: "stripe" });
  return sendError(res, 409, "SUBSCRIPTION_EXISTS", "You already have a Watchdog subscription. Use Manage billing instead.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  const user = await requireAuth(req, res);
  if (!user) return;
  let body = {};
  try { body = await readJsonBody(req, 4096); } catch { body = {}; }
  const plan = body?.plan === "year" ? "year" : "month";
  const { STRIPE_SECRET_KEY } = process.env;
  const priceId = plan === "year" ? process.env.STRIPE_PRICE_ID_YEARLY : process.env.STRIPE_PRICE_ID_MONTHLY;
  const origin = appOrigin();
  if (!STRIPE_SECRET_KEY || !priceId || !origin) return sendError(res, 503, "FEATURE_DISABLED", "Billing is temporarily unavailable.");

  const reservation = await reserveAction({ action: "stripe_checkout", userId: user.id, scope: `user:${user.id}`, req });
  if (!reservation.allowed) return rejectReservation(res, reservation);
  try {
    const profile = await billingForUser(user.id);
    if (billingHasLiveSubscription(profile)) return rejectExistingSubscription(res, reservation.event_id);
    if (profile.stripe_customer_id && await customerHasLiveSubscription(profile.stripe_customer_id, STRIPE_SECRET_KEY)) {
      return rejectExistingSubscription(res, reservation.event_id);
    }

    const params = new URLSearchParams({
      mode: "subscription", "line_items[0][price]": priceId, "line_items[0][quantity]": "1",
      success_url: `${origin}/?checkout=success`, cancel_url: `${origin}/?checkout=cancelled`,
      client_reference_id: user.id,
      allow_promotion_codes: "true", "subscription_data[metadata][user_id]": user.id,
      "automatic_tax[enabled]": "true",
      billing_address_collection: "required",
    });
    if (profile.stripe_customer_id) params.set("customer", profile.stripe_customer_id);
    else params.set("customer_email", user.email);

    const key = idempotencyKey(req) || `checkout:${user.id}:${plan}:${new Date().toISOString().slice(0, 13)}`;
    const response = await providerFetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": hashScope(key) },
      body: params.toString(),
    }, { timeoutMs: 15000, maxRetries: 1 });
    if (!response.ok) throw Object.assign(new Error("Stripe checkout rejected"), { providerStatus: response.status });
    const session = await response.json();
    await finishAction(reservation.event_id, { state: "succeeded", provider: "stripe", providerRequestId: response.headers.get("request-id") });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    await finishAction(reservation.event_id, { state: "failed", errorCategory: error.errorCategory || "provider_failure", provider: error.errorCategory ? null : "stripe" });
    console.error("[stripe/checkout] request failed", { category: error.errorCategory || "provider_failure", status: error.providerStatus || null });
    return sendError(res, 503, "PROVIDER_UNAVAILABLE", "Billing is temporarily unavailable.");
  }
}
