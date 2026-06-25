// =============================================================
// API LAYER — currently returns MOCK data.
//
// When the Supabase backend is deployed, uncomment the supabase
// client below and swap each function body from the mock return
// to the real query. The frontend components already call THESE
// functions, so nothing in the UI needs to change — only this file.
//
// The endpoints referenced (/api/upload, /api/invoices/override)
// already exist in the backend build.
// =============================================================

// import { createClient } from '@supabase/supabase-js';
// import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
// export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

import { invoices, wholesalers, reviewQueue, profile } from '$lib/data/mock.js';

export async function getInvoices() {
  // REAL:
  // const { data } = await supabase
  //   .from('invoices')
  //   .select('*, line_items(*)')
  //   .eq('status', 'confirmed')
  //   .order('due_date', { ascending: true });
  // return data;
  return invoices;
}

export async function getReviewQueue() {
  // REAL:
  // const { data } = await supabase
  //   .from('invoices').select('*, line_items(*)').eq('status', 'review');
  // return data;
  return reviewQueue;
}

export async function getWholesalers() {
  // REAL: const { data } = await supabase.from('wholesalers').select('*');
  return wholesalers;
}

export async function getProfile() {
  // REAL: const { data } = await supabase.from('profiles').select('*').single();
  return profile;
}

export async function uploadInvoice(file) {
  // REAL: POST the file to the existing /api/upload endpoint, which stores it
  // in Supabase Storage and triggers parseInvoice.
  // const form = new FormData(); form.append('file', file);
  // return fetch('/api/upload', { method: 'POST', body: form }).then(r => r.json());
  return { ok: true, status: 'review' };
}

export async function confirmInvoice(invoiceId) {
  // REAL: calls the existing /api/invoices/override endpoint with { confirm: true }.
  // return fetch('/api/invoices/override', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ invoiceId, confirm: true })
  // }).then(r => r.json());
  return { ok: true };
}

export async function saveWholesaler(w) {
  // REAL: supabase.from('wholesalers').upsert(w)
  return { ok: true };
}
