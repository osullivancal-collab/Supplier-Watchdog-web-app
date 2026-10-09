// Opens Stripe's billing portal (change card, cancel, invoices).
// Adapted from SoleTasker api/stripe/portal.js; reads account_billing instead of profiles.
import { requireAuth } from "../_auth.js";
import { appOrigin } from "../_origin.js";
import { billingForUser } from "../_billing.js";
import { providerFetch } from "../_provider.js";
import { finishAction, rejectReservation, reserveAction, sendError } from "../_security.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  const user = await requireAuth(req, res);
  if (!user) return;
  const origin = appOrigin();
  if (!process.env.STRIPE_SECRET_KEY || !origin) return sendError(res, 503, "FEATURE_DISABLED", "Billing is temporarily unavailable.");

  const reservation = await reserveAction({ action: "stripe_portal", userId: user.id, scope: `user:${user.id}`, req });
  if (!reservation.allowed) return rejectReservation(res, reservation);
  try {
    const customerId = (await billingForUser(user.id)).stripe_customer_id;
    if (!customerId) {
      await finishAction(reservation.event_id, { state: "released", errorCategory: "no_customer" });
      return sendError(res, 400, "INVALID_REQUEST", "Complete checkout before opening the billing portal.");
    }
    const params = new URLSearchParams({ customer: customerId, return_url: `${origin}/` });
    const response = await providerFetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString(),
    }, { timeoutMs: 15000, maxRetries: 1 });
    if (!response.ok) throw Object.assign(new Error("Stripe portal rejected"), { providerStatus: response.status });
    const session = await response.json();
    await finishAction(reservation.event_id, { state: "succeeded", provider: "stripe", providerRequestId: response.headers.get("request-id") });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    await finishAction(reservation.event_id, { state: "failed", errorCategory: "provider_failure", provider: "stripe" });
    console.error("[stripe/portal] request failed", { category: "provider_failure", status: error.providerStatus || null });
    return sendError(res, 503, "PROVIDER_UNAVAILABLE", "Billing is temporarily unavailable.");
  }
}
