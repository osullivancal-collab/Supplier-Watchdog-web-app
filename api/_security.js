// Rate limits, usage ledger and webhook de-duplication for the API routes.
// Copied from SoleTasker's api/_security.js. Only the LIMITS table is
// Watchdog's own; the rest is unchanged, so fixes can flow between the two.

import crypto from "crypto";

const SERVICE_HEADERS = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
});

export const LIMITS = Object.freeze({
  // Reading a photographed or emailed bill with AI. A busy tradie gets maybe
  // 5-15 bills a day; burst and concurrency stop a stuck button or a script.
  // The monthly allowance is passed in by the route (INVOICE_READ_MONTHLY_ALLOWANCE).
  invoice_read: { windowSeconds: 60, burst: 6, concurrency: 2, leaseSeconds: 90, daily: 60, globalDaily: 5000 },
  stripe_checkout: { windowSeconds: 600, burst: 5, concurrency: 1, leaseSeconds: 30, daily: 20, globalDaily: 5000 },
  stripe_portal: { windowSeconds: 600, burst: 10, concurrency: 1, leaseSeconds: 30, daily: 40, globalDaily: 5000 },
  // Forward-your-bills email (not built yet; limits kept from SoleTasker so they
  // are ready). Sender identity can be spoofed, so it is only a throttle, never
  // a permission.
  email_intake_receive: { windowSeconds: 60, burst: 5, concurrency: 2, leaseSeconds: 180, daily: 40, globalDaily: 2000 },
  email_intake_sender: { windowSeconds: 3600, burst: 10, concurrency: 1, leaseSeconds: 180, daily: 40, globalDaily: null },
});

const envInt = (name, fallback, min = 1) => {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

export const actionConfig = (action) => {
  const base = LIMITS[action];
  if (!base) throw new Error(`Unknown protected action: ${action}`);
  const prefix = action.toUpperCase();
  return {
    windowSeconds: envInt(`${prefix}_WINDOW_SECONDS`, base.windowSeconds),
    burst: envInt(`${prefix}_BURST_LIMIT`, base.burst),
    concurrency: envInt(`${prefix}_CONCURRENCY_LIMIT`, base.concurrency),
    leaseSeconds: envInt(`${prefix}_LEASE_SECONDS`, base.leaseSeconds),
    daily: envInt(`${prefix}_DAILY_SAFETY_LIMIT`, base.daily),
    globalDaily: envInt(`${prefix}_GLOBAL_DAILY_SAFETY_LIMIT`, base.globalDaily),
  };
};

export const featureEnabled = (name) => process.env[name] !== "false";

export const hashScope = (value) => crypto
  .createHmac("sha256", process.env.SECURITY_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-development")
  .update(String(value))
  .digest("hex");

export const requestIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim()
    || req.socket?.remoteAddress || "unknown";
};

export const idempotencyKey = (req) => {
  const raw = req.headers["x-idempotency-key"] || req.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : null;
};

const ERROR_MESSAGES = {
  RATE_LIMITED: "Too many requests. Please wait and try again.",
  TOO_MANY_IN_FLIGHT: "This action is already running. Please wait for it to finish.",
  REQUEST_IN_PROGRESS: "This request is already being processed.",
  DUPLICATE_REQUEST: "This request has already been processed.",
  ALLOWANCE_EXHAUSTED: "Your current usage allowance has been reached.",
  DAILY_SAFETY_LIMIT: "This action is temporarily unavailable because its safety limit was reached.",
  GLOBAL_SAFETY_LIMIT: "This action is temporarily unavailable because its safety limit was reached.",
  SECURITY_CONTROL_UNAVAILABLE: "This action is temporarily unavailable. Please try again shortly.",
  FEATURE_DISABLED: "This feature is temporarily unavailable.",
  INVALID_REQUEST: "The request was invalid.",
  INVALID_FILE: "The selected file is not supported.",
  FILE_TOO_LARGE: "The selected file is too large.",
  PROVIDER_UNAVAILABLE: "The service is temporarily unavailable. Please try again.",
};

export function sendError(res, status, code, message, retryAfter) {
  if (retryAfter) res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfter))));
  return res.status(status).json({ error: { code, message: message || ERROR_MESSAGES[code] || "Request failed." } });
}

export async function readRawBody(req, maxBytes) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > maxBytes) throw Object.assign(new Error("Body too large"), { status: 413, code: "FILE_TOO_LARGE" });
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throw Object.assign(new Error("Body too large"), { status: 413, code: "FILE_TOO_LARGE" });
    return req.body;
  }
  if (typeof req.body === "string") {
    const body = Buffer.from(req.body);
    if (body.length > maxBytes) throw Object.assign(new Error("Body too large"), { status: 413, code: "FILE_TOO_LARGE" });
    return body;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    req.on("data", chunk => {
      if (exceeded) return;
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += part.length;
      if (size > maxBytes) {
        exceeded = true;
        reject(Object.assign(new Error("Body too large"), { status: 413, code: "FILE_TOO_LARGE" }));
        return;
      }
      chunks.push(part);
    });
    req.on("end", () => { if (!exceeded) resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

export async function readJsonBody(req, maxBytes) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized) > maxBytes) throw Object.assign(new Error("Body too large"), { status: 413, code: "FILE_TOO_LARGE" });
    return req.body;
  }
  const raw = await readRawBody(req, maxBytes);
  try { return JSON.parse(raw.toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("Invalid JSON"), { status: 400, code: "INVALID_REQUEST" }); }
}

async function rpc(name, args) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST", headers: SERVICE_HEADERS(), body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${name} failed with ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function reserveAction({ action, userId = null, scope, req, inputBytes = null, periodKey = null, periodLimit = null, metadata = {} }) {
  const cfg = actionConfig(action);
  const scopeHash = hashScope(scope);
  const key = idempotencyKey(req);
  try {
    const result = await rpc("reserve_api_action", {
      p_action: action,
      p_user_id: userId,
      p_scope_key_hash: scopeHash,
      p_idempotency_key_hash: key ? hashScope(key) : null,
      p_window_seconds: cfg.windowSeconds,
      p_burst_limit: cfg.burst,
      p_concurrency_limit: cfg.concurrency,
      p_period_key: periodKey,
      p_period_limit: periodLimit,
      p_daily_limit: cfg.daily,
      p_global_daily_limit: cfg.globalDaily,
      p_lease_seconds: cfg.leaseSeconds,
      p_input_bytes: inputBytes,
      p_metadata: metadata,
    });
    return { ...result, retryAfter: result?.retry_after };
  } catch (error) {
    console.error(`[security] ${action} reservation unavailable`, { category: "control_unavailable" });
    return { allowed: false, code: "SECURITY_CONTROL_UNAVAILABLE", internalError: error };
  }
}

export function rejectReservation(res, reservation) {
  const code = reservation.code || "SECURITY_CONTROL_UNAVAILABLE";
  const status = ["RATE_LIMITED", "TOO_MANY_IN_FLIGHT", "REQUEST_IN_PROGRESS", "ALLOWANCE_EXHAUSTED", "DAILY_SAFETY_LIMIT", "GLOBAL_SAFETY_LIMIT"].includes(code) ? 429
    : code === "DUPLICATE_REQUEST" ? 409 : 503;
  return sendError(res, status, code, null, reservation.retryAfter);
}

export async function finishAction(eventId, details = {}) {
  if (!eventId) return;
  try {
    await rpc("finish_api_action", {
      p_event_id: eventId,
      p_state: details.state || "succeeded",
      p_error_category: details.errorCategory || null,
      p_provider: details.provider || null,
      p_provider_request_id: details.providerRequestId || null,
      p_input_units: details.inputUnits ?? null,
      p_output_units: details.outputUnits ?? null,
      p_estimated_cost_usd: details.estimatedCostUsd ?? null,
      p_duration_ms: details.durationMs ?? null,
    });
  } catch {
    console.error("[security] usage completion failed", { category: "ledger_write_failed" });
  }
}

export async function claimWebhook(provider, eventId, eventType, leaseSeconds = 120) {
  return rpc("claim_webhook_event", { p_provider: provider, p_provider_event_id: eventId, p_event_type: eventType, p_lease_seconds: leaseSeconds });
}

export async function finishWebhook(eventId, succeeded, errorCategory = null) {
  return rpc("finish_webhook_event", { p_event_id: eventId, p_succeeded: succeeded, p_error_category: errorCategory });
}
