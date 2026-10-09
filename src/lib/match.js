// Match the supplier name read off a bill to one of the tradie's suppliers.
// "REECE AUSTRALIA PTY LTD" → Reece; "Tradelink Plumbing Supplies" → Tradelink.
const NOISE = /\b(pty|ltd|limited|australia|aust|group|holdings|trade|trading|supplies|supply|the|co|inc|p\/l)\b/g;
const norm = (s) => String(s || '').toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9/ ]+/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();

export function matchSupplier(readName, suppliers) {
  const want = norm(readName);
  if (!want) return null;
  const scored = suppliers.map((s) => {
    const have = norm(s.name);
    if (!have) return [s, 0];
    if (have === want) return [s, 3];
    if (want.split(' ')[0] === have.split(' ')[0]) return [s, 2];
    if (want.includes(have) || have.includes(want)) return [s, 1];
    return [s, 0];
  }).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return scored[0]?.[0] || null;
}
