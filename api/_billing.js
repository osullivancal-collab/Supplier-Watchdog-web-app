// Reads and writes the locked account_billing table with the server key.
// Browsers can read their own row but never write it (see 001_watchdog_schema.sql).

const headers = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
});

const TERMINAL = new Set(['canceled', 'incomplete_expired']);

export const hasLiveSubscription = (subscriptions) => Array.isArray(subscriptions)
  && subscriptions.some((s) => {
    const status = String(s?.status || '').toLowerCase();
    return Boolean(status) && !TERMINAL.has(status);
  });

export const billingHasLiveSubscription = (row) => Boolean(row?.stripe_subscription_id)
  && !TERMINAL.has(String(row?.subscription_status || '').toLowerCase());

async function one(query) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/account_billing?${query}&limit=2`, {
    headers: headers(), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error('Billing lookup failed'), { errorCategory: 'billing_state_check' });
  const rows = await response.json();
  if (rows.length !== 1) throw Object.assign(new Error('Billing lookup mismatch'), { errorCategory: 'billing_state_check' });
  return rows[0];
}

export const billingForUser = (userId) =>
  one(`user_id=eq.${encodeURIComponent(userId)}&select=user_id,stripe_customer_id,stripe_subscription_id,subscription_status`);

export function billingForCustomer(customerId) {
  if (typeof customerId !== 'string' || !customerId) throw new Error('Customer missing');
  return one(`stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=user_id,subscription_status`);
}

export async function updateBilling(userId, changes) {
  if (!userId) throw new Error('Billing owner not found');
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/account_billing?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Billing update failed');
  const rows = await response.json();
  if (rows.length !== 1) throw new Error('Billing update target mismatch');
}
