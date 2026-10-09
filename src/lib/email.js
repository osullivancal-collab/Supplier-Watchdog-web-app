// Same rule the server uses (api/_validation.js normalizeEmail).
export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/.test(email) ? email : null;
}
