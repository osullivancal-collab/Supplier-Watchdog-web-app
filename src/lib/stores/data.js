import { writable, derived } from 'svelte/store';
import { invoices as seedInvoices, reviewQueue as seedQueue, incomingBill } from '$lib/data/mock.js';

// In production these initial values come from Supabase queries (see api.js).
export const invoices = writable([...seedInvoices]);
export const queue = writable([...seedQueue]);

// Running tally = confirmed invoices + credit notes (negatives subtract).
export const monthTotal = derived(invoices, ($inv) =>
  $inv
    .filter((i) => i.status === 'confirmed')
    .reduce((sum, i) => sum + i.total_amount, 0)
);

// Outstanding bills (not paid) sorted by due date — the cash-flow view.
export const upcoming = derived(invoices, ($inv) =>
  $inv
    .filter((i) => i.doc_type === 'invoice' && i.due_date)
    .sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date))
);

export const spikeCount = derived(invoices, ($inv) =>
  $inv.reduce((n, i) => n + i.line_items.filter((li) => li.price_spike).length, 0)
);

// --- Demo actions (mutate local state; real version calls the API) ---

// Confirm a bill out of the review queue → moves into invoices as 'confirmed'.
export function confirmFromQueue(id) {
  queue.update((q) => {
    const bill = q.find((b) => b.id === id);
    if (bill) invoices.update((inv) => [{ ...bill, status: 'confirmed' }, ...inv]);
    return q.filter((b) => b.id !== id);
  });
}

// Simulate a bill arriving by email (the demo "wow" moment).
export function simulateIncoming() {
  queue.update((q) => {
    if (q.some((b) => b.id === incomingBill.id)) return q;
    return [{ ...incomingBill }, ...q];
  });
}
