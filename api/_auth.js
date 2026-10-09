// Sign-in and paid-access checks for the API routes.
// Adapted from SoleTasker's api/_auth.js: same approach (verify the Supabase
// session token with Supabase itself, then ask the database whether this
// account may use paid features), with Watchdog's wording.

const serviceHeaders = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
});

const unauthenticated = (res) =>
  res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } });

export async function requireAuth(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { unauthenticated(res); return null; }

  let response;
  try {
    response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Sign-in check is down for a moment. Try again.' } });
    return null;
  }
  if (!response.ok) { unauthenticated(res); return null; }
  const user = await response.json();
  if (!user?.id) { unauthenticated(res); return null; }
  return user;
}

/** { status, trialActive, hasAccess } or null when the check itself failed. */
export async function subscriptionAccessForUserId(userId) {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_subscription_access_for_user`, {
      method: 'POST',
      headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) { console.error('[auth] access check failed', response.status); return null; }
    const row = (await response.json())?.[0];
    if (!row) return null;
    return { status: String(row.subscription_status || 'inactive'), trialActive: Boolean(row.trial_active), hasAccess: Boolean(row.has_access) };
  } catch (error) {
    console.error('[auth] access check failed', error?.message || error);
    return null;
  }
}

export async function requireActiveAccess(user, res) {
  const access = await subscriptionAccessForUserId(user?.id);
  if (!access) {
    res.status(503).json({ error: { code: 'ACCESS_CHECK_UNAVAILABLE', message: 'We couldn’t check your Watchdog plan. Try again.' } });
    return false;
  }
  if (!access.hasAccess) {
    res.status(402).json({ error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Your free trial has ended. Subscribe to keep adding bills.' } });
    return false;
  }
  return true;
}

/** The account's own business, so the invoice reader never mistakes the buyer for the supplier. */
export async function businessForUserId(userId) {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=owner_name,business_name,abn&limit=1`,
      { headers: serviceHeaders(), signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) { console.error('[auth] business lookup failed', response.status); return null; }
    const row = (await response.json())?.[0];
    return row ? { name: row.owner_name || '', company: row.business_name || '', abn: row.abn || '' } : null;
  } catch (error) {
    // A lookup hiccup shouldn't block reading a bill; it just reads without that hint.
    console.error('[auth] business lookup failed', error?.message || error);
    return null;
  }
}
