// =============================================================
// MOCK DATA — mirrors the real Supabase schema field-for-field.
// When the backend is live, these arrays get replaced by queries
// (see src/lib/api.js). Field names match the `invoices` and
// `line_items` tables from the architecture build:
//   status: 'parsed' | 'review' | 'confirmed'
//   doc_type: 'invoice' | 'credit_note'
//   total_amount stored in dollars here for display simplicity.
// =============================================================

export const profile = {
  business_name: 'Site Crew Pty Ltd',
  inbound_email: 'u_a1b2c3@in.watchdog.app', // the unique forward-to address
  abn: '12 345 678 901',
  full_name: 'Mick Tucker',
  email: 'mick@sitecrew.com.au'
};

export const wholesalers = [
  // delivery: how invoices reach the app from this supplier.
  //   'auto'      — account billing email is set to the inbound address (best)
  //   'forward'   — a mail forward rule catches their emails
  //   'manual'    — relying on photo/upload only (least reliable)
  { id: 'w1', name: 'Tradelink', contact: 'Dave Mercer', phone: '03 9421 7780', email: 'dave@tradelink.com.au', account: 'TL-44120', delivery: 'auto' },
  { id: 'w2', name: 'Reece Plumbing', contact: 'Sandra Liu', phone: '03 9388 2210', email: 'sliu@reece.com.au', account: 'RE-09887', delivery: 'auto' },
  { id: 'w3', name: 'Bunnings Trade', contact: 'Trade Desk', phone: '1300 266 464', email: 'trade@bunnings.com.au', account: 'BT-77301', delivery: 'forward' },
  { id: 'w4', name: 'Middys Electrical', contact: 'Paul Nguyen', phone: '03 9555 1020', email: 'paul.n@middys.com.au', account: 'MD-30214', delivery: 'manual' }
];

// Each invoice carries its line_items inline (in the DB they're a separate table).
export const invoices = [
  {
    id: 'inv-2041', wholesaler_id: 'w1', wholesaler_name: 'Tradelink',
    doc_type: 'invoice', invoice_number: 'INV-2041', status: 'confirmed',
    invoice_date: '2026-05-29', due_date: '2026-06-12', total_amount: 1842.50,
    source: 'email',
    line_items: [
      { raw_description: '90mm PVC DWV Pipe 6m', normalized_key: 'pvc_dwv_90_6m', quantity: 20, unit_price: 49.80, line_total: 996.00, price_spike: true, prev_unit_price: 42.50 },
      { raw_description: 'PVC Solvent Cement 500ml', normalized_key: 'pvc_cement_500', quantity: 6, unit_price: 18.40, line_total: 110.40, price_spike: false, prev_unit_price: 18.40 },
      { raw_description: 'Pipe Bracket 90mm', normalized_key: 'bracket_90', quantity: 48, unit_price: 15.33, line_total: 736.10, price_spike: false, prev_unit_price: null }
    ]
  },
  {
    id: 'inv-2038', wholesaler_id: 'w2', wholesaler_name: 'Reece Plumbing',
    doc_type: 'invoice', invoice_number: 'INV-2038', status: 'confirmed',
    invoice_date: '2026-06-08', due_date: '2026-06-22', total_amount: 926.00,
    source: 'email',
    line_items: [
      { raw_description: 'Mixer Tap Chrome', normalized_key: 'mixer_tap_chrome', quantity: 4, unit_price: 142.00, line_total: 568.00, price_spike: false, prev_unit_price: 139.00 },
      { raw_description: 'Flexible Hose 450mm', normalized_key: 'flex_hose_450', quantity: 12, unit_price: 29.83, line_total: 358.00, price_spike: false, prev_unit_price: null }
    ]
  },
  {
    id: 'inv-2036', wholesaler_id: 'w3', wholesaler_name: 'Bunnings Trade',
    doc_type: 'invoice', invoice_number: 'INV-2036', status: 'confirmed',
    invoice_date: '2026-06-10', due_date: '2026-06-24', total_amount: 418.80,
    source: 'camera',
    line_items: [
      { raw_description: '20kg General Cement', normalized_key: 'cement_20kg', quantity: 30, unit_price: 9.80, line_total: 294.00, price_spike: false, prev_unit_price: 9.50 },
      { raw_description: 'Sand 20kg', normalized_key: 'sand_20kg', quantity: 18, unit_price: 6.93, line_total: 124.80, price_spike: false, prev_unit_price: null }
    ]
  },
  {
    id: 'inv-2031', wholesaler_id: 'w4', wholesaler_name: 'Middys Electrical',
    doc_type: 'invoice', invoice_number: 'INV-2031', status: 'confirmed',
    invoice_date: '2026-05-19', due_date: '2026-06-02', total_amount: 2134.00,
    source: 'email',
    line_items: [
      { raw_description: '2.5mm TPS Cable 100m', normalized_key: 'tps_25_100m', quantity: 8, unit_price: 172.00, line_total: 1376.00, price_spike: false, prev_unit_price: 189.00 },
      { raw_description: 'Double GPO White', normalized_key: 'double_gpo', quantity: 60, unit_price: 12.63, line_total: 758.00, price_spike: false, prev_unit_price: null }
    ]
  },
  // A credit note — subtracts from the tally
  {
    id: 'cr-0007', wholesaler_id: 'w2', wholesaler_name: 'Reece Plumbing',
    doc_type: 'credit_note', invoice_number: 'CR-0007', status: 'confirmed',
    invoice_date: '2026-06-05', due_date: null, total_amount: -213.00,
    source: 'email',
    line_items: [
      { raw_description: 'Returned: Mixer Tap Chrome', normalized_key: 'mixer_tap_chrome', quantity: -1, unit_price: 142.00, line_total: -142.00, price_spike: false, prev_unit_price: null },
      { raw_description: 'Returned: Flex Hose 450mm', normalized_key: 'flex_hose_450', quantity: -2, unit_price: 35.50, line_total: -71.00, price_spike: false, prev_unit_price: null }
    ]
  }
];

// Sits in the REVIEW QUEUE — freshly parsed, awaiting tradie confirm.
export const reviewQueue = [
  {
    id: 'inv-2050', wholesaler_id: 'w1', wholesaler_name: 'Tradelink',
    doc_type: 'invoice', invoice_number: 'INV-2050', status: 'review',
    invoice_date: '2026-06-18', due_date: '2026-07-02', total_amount: 612.40,
    source: 'email', confidence: 0.91,
    line_items: [
      { raw_description: '40mm PVC Pipe 6m', normalized_key: 'pvc_40_6m', quantity: 15, unit_price: 28.40, line_total: 426.00, price_spike: false, prev_unit_price: null },
      { raw_description: 'Pipe Bracket 40mm', normalized_key: 'bracket_40', quantity: 30, unit_price: 6.21, line_total: 186.40, price_spike: false, prev_unit_price: null }
    ]
  }
];

// The bill that "arrives" during the demo (the wow moment).
export const incomingBill = {
  id: 'inv-2051', wholesaler_id: 'w2', wholesaler_name: 'Reece Plumbing',
  doc_type: 'invoice', invoice_number: 'INV-2051', status: 'review',
  invoice_date: '2026-06-19', due_date: '2026-07-03', total_amount: 487.20,
  source: 'email', confidence: 0.88,
  line_items: [
    { raw_description: '15mm Copper Pipe 6m', normalized_key: 'copper_15_6m', quantity: 12, unit_price: 32.60, line_total: 391.20, price_spike: true, prev_unit_price: 27.10 },
    { raw_description: 'Copper Elbow 15mm', normalized_key: 'elbow_15', quantity: 24, unit_price: 4.00, line_total: 96.00, price_spike: false, prev_unit_price: null }
  ]
};

// =============================================================
// SPEND HISTORY — for the "stock ticker" supplier views.
// Per-period (monthly) spend buckets. In production this is a
// GROUP BY month query over the invoices table per wholesaler.
// (Superseded below by the 6-month merge data: `months` + `spendHistory`.)
// =============================================================

// =============================================================
// MERGE ADDITIONS (from the design viewer) — bills with paid-status
// lifecycle, 6-month spend history, supplier mix, and price spikes.
// In production: bills = invoices table; spend = GROUP BY month;
// spikes = line_items WHERE price_spike = true AND prev_unit_price IS NOT NULL.
// =============================================================

export const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

// Per-supplier monthly spend (id-keyed). Realistic ups & downs — job-based lumps,
// price hike steps, quiet months. Matches the viewer mock data exactly.
export const spendHistory = {
  w1: [4820, 2340, 1650, 3270, 4100, 1842], // Tradelink — big Jan, dipped Mar, climbed May, dropped Jun
  w2: [1240, 480, 2870, 390, 1580, 713],     // Reece — lumpy job-based
  w3: [620, 940, 780, 1380, 1050, 419],      // Bunnings — steady with mid-year run-up
  w4: [0, 3900, 820, 0, 2134, 573],          // Middys — infrequent big lumps
  w5: [175, 175, 210, 210, 210, 195]         // Telstra — flat with Mar price-hike step
};

// Supplier list used by holdings/watchlist (includes the non-trade payee).
export const holdings = [
  { id: 'w1', name: 'Tradelink', nonTrade: false },
  { id: 'w2', name: 'Reece Plumbing', nonTrade: false },
  { id: 'w3', name: 'Bunnings Trade', nonTrade: false },
  { id: 'w4', name: 'Middys Electrical', nonTrade: false },
  { id: 'w5', name: 'Telstra', nonTrade: true }
];

export const spendTotalHistory = months.map((_, i) =>
  Object.values(spendHistory).reduce((sum, arr) => sum + (arr[i] ?? 0), 0)
);

// Bills lifecycle: 'approve' | 'owed' | 'probably_paid' | 'paid'.
// `due` = days from "today" (negative = overdue). 14+ overdue auto-assumes paid.
export const billsSeed = [
  { id: 'b0', vendor: 'Reece Plumbing', number: 'INV-2051', total: 487.20, due: 14, status: 'approve', trade: true, confidence: 88, source: 'email' },
  { id: 'b1', vendor: 'Middys Electrical', number: 'INV-2029', total: 573.10, due: -18, status: 'probably_paid', trade: true, source: 'email' },
  { id: 'b2', vendor: 'Tradelink', number: 'INV-2041', total: 1842.50, due: -7, status: 'owed', trade: true, source: 'email' },
  { id: 'b3', vendor: 'Reece Plumbing', number: 'INV-2038', total: 926.00, due: 3, status: 'owed', trade: true, source: 'email' },
  { id: 'b4', vendor: 'Bunnings Trade', number: 'INV-2036', total: 418.80, due: 5, status: 'owed', trade: true, source: 'camera' },
  { id: 'b5', vendor: 'Telstra', number: 'TEL-JUN', total: 195.00, due: 8, status: 'owed', trade: false, source: 'inbox' },
  { id: 'b6', vendor: 'CSR Gyprock', number: 'INV-2019', total: 760.40, due: 11, status: 'owed', trade: true, source: 'email' },
  { id: 'b7', vendor: 'City Mechanical', number: 'CM-7782', total: 540.00, due: 14, status: 'owed', trade: false, source: 'camera' },
  { id: 'b8', vendor: 'Tradelink', number: 'INV-2025', total: 1289.00, due: -34, status: 'paid', trade: true, source: 'email' },
  { id: 'b9', vendor: 'Bowens Timber', number: 'INV-2031', total: 2134.00, due: -28, status: 'paid', trade: true, source: 'email' },
  { id: 'b10', vendor: 'Telstra', number: 'TEL-MAY', total: 180.00, due: -40, status: 'paid', trade: false, source: 'inbox' }
];

export const spikes = [
  { name: '90mm PVC DWV Pipe 6m', vendor: 'Tradelink', price: 49.80, prev: 42.50 },
  { name: '15mm Copper Pipe 6m', vendor: 'Reece Plumbing', price: 32.60, prev: 27.10 }
];

// Back-compat aliases for the supplier pages (use the 6-month data now).
export const spendMonths = months;
export const spendHistoryTotal = spendTotalHistory;

// =============================================================
// SUPPLIER DEALS — verbal agreements made at the counter.
// Mirrors the future `deals` table. `target` is free text
// ("$5,000" or "70%"). status: 'active' | 'completed'.
// result: 'won' | 'lost' | null. current_value/final_value
// computed from invoice data (deterministic), not stored stale.
// =============================================================
export const deals = [
  {
    id: 'd1', name: 'July Gold Challenge', supplier: 'Middys Electrical',
    target: '70%', end_date: '2026-07-31', status: 'active',
    result: null, current_value: 63, final_value: null, reward: 'Milwaukee Packout'
  },
  {
    id: 'd2', name: 'Reece $5K Sprint', supplier: 'Reece Plumbing',
    target: '$5,000', end_date: '2026-07-31', status: 'active',
    result: null, current_value: 3840, final_value: null, reward: '$200 account credit'
  },
  {
    id: 'd3', name: 'Bunnings Below 5%', supplier: 'Bunnings Trade',
    target: 'Below 5%', end_date: '2026-06-30', status: 'completed',
    result: 'won', current_value: null, final_value: 4, reward: null
  },
  {
    id: 'd4', name: 'Tradelink Silver', supplier: 'Tradelink',
    target: '50%', end_date: '2026-06-30', status: 'completed',
    result: 'lost', current_value: null, final_value: 42, reward: 'Free delivery month'
  },
  {
    id: 'd5', name: 'May Reece Gold', supplier: 'Reece Plumbing',
    target: '25%', end_date: '2026-05-31', status: 'completed',
    result: 'won', current_value: null, final_value: 28, reward: 'Discount code'
  }
];
