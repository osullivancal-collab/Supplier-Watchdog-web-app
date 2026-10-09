import { useCallback, useEffect, useState } from 'react';

// The app's link to the backend (Supabase login + database, and our /api routes).
//
// Off until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set at build time.
// While it's off the app works exactly as before: everything on the phone,
// in localStorage. The Supabase library is only downloaded when it's on.
//
// The anon key is meant to be public (it's in every Supabase web app); what
// protects data is row-level security in supabase/migrations. The service-role
// key is server-only and must never get a VITE_ prefix.

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const backendEnabled = Boolean(URL_ && KEY);

let clientPromise = null;
export function getClient() {
  if (!backendEnabled) return Promise.resolve(null);
  clientPromise ||= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
  return clientPromise;
}

/** Email a one-tap sign-in link. Tradies on a phone shouldn't need a password. */
export async function sendMagicLink(email) {
  const sb = await getClient();
  if (!sb) throw new Error('Sign-in isn’t switched on yet.');
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
}

export async function signOut() {
  const sb = await getClient();
  if (sb) await sb.auth.signOut();
}

/** Trial / plan state. Starts the 14-day trial on first call. */
export async function myAccess() {
  const sb = await getClient();
  if (!sb) return null;
  const { data, error } = await sb.rpc('get_my_subscription_access');
  if (error) { console.error('[backend] access check failed', error.message); return null; }
  return data?.[0] || null;
}

async function call(path, body) {
  const sb = await getClient();
  const token = sb && (await sb.auth.getSession()).data.session?.access_token;
  if (!token) throw Object.assign(new Error('Please sign in to continue.'), { code: 'UNAUTHENTICATED' });
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json?.error?.message || 'Something went wrong.'), { code: json?.error?.code, status: response.status });
  return json;
}

/** Photos (data URLs, already shrunk) of one bill → { bill, flags, confidence }. */
export const readInvoice = (images) => call('/api/invoice-read', { type: 'images', images });

/** Opens Stripe Checkout. plan: 'month' | 'year'. */
export async function startCheckout(plan) {
  const { url } = await call('/api/stripe/checkout', { plan });
  window.location.assign(url);
}

export async function openBillingPortal() {
  const { url } = await call('/api/stripe/portal');
  window.location.assign(url);
}

/** A short-lived link to a docket photo in private storage. */
export async function photoUrl(path) {
  const sb = await getClient();
  if (!sb || !path) return null;
  const { data, error } = await sb.storage.from('dockets').createSignedUrl(path, 300);
  if (error) { console.error('[backend] photo link failed', error.message); return null; }
  return data.signedUrl;
}

/** undefined while checking, null when signed out, else the Supabase session. */
export function useSession() {
  const [session, setSession] = useState(backendEnabled ? undefined : null);
  useEffect(() => {
    if (!backendEnabled) return undefined;
    let sub;
    let alive = true;
    getClient().then((sb) => {
      sb.auth.getSession().then(({ data }) => { if (alive) setSession(data.session || null); });
      sub = sb.auth.onAuthStateChange((_event, s) => { if (alive) setSession(s || null); }).data.subscription;
    });
    return () => { alive = false; sub?.unsubscribe(); };
  }, []);
  return session;
}

/** Trial / plan state for the signed-in account, with a way to re-check it. */
export function useAccess(session) {
  const [access, setAccess] = useState(null);
  const refresh = useCallback(async () => { if (session) setAccess(await myAccess()); }, [session]);
  useEffect(() => { refresh(); }, [refresh]);
  return [access, refresh];
}

export const daysLeft = (iso) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400000)) : 0);
