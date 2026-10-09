// The app's own address, for Stripe's "come back to" links. Preview builds use
// their own preview address so testing checkout never lands on production.
// (Same rule as SoleTasker's checkout/portal, kept in one place here.)
export function appOrigin(env = process.env) {
  const previewHost = env.VERCEL_ENV === 'preview' ? (env.VERCEL_BRANCH_URL || env.VERCEL_URL) : '';
  const raw = previewHost
    ? `https://${previewHost}`
    : env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  try { return new URL(raw).origin; } catch { return null; }
}
