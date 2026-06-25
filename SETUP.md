# Wholesaler Watchdog — Frontend Setup Walkthrough

This is the **SvelteKit frontend** for Wholesaler Watchdog. It runs **right now on
mock data** — every screen is full and the demo works — so you can see and show it
before the backend is deployed. When the backend goes live, you swap mock for real
in ONE file (`src/lib/api.js`). No screens need to change.

---

## Part 1 — Get it running (about 10 minutes)

### 1. Install Node.js (skip if you already have it)
- Go to https://nodejs.org and install the **LTS** version.
- Verify it worked — open your terminal (Mac: Terminal app / Windows: PowerShell) and type:
  ```
  node -v
  ```
  You should see a version number like `v20.x` or higher. If you see "command not
  found", Node didn't install — restart your terminal and try again.

### 2. Open this project in your terminal
- Unzip the folder somewhere you'll find it (e.g. Desktop).
- In the terminal, navigate into it:
  ```
  cd Desktop/ww-frontend
  ```
  (Adjust the path to wherever you unzipped it.)

### 3. Install the project's dependencies
  ```
  npm install
  ```
  This downloads the libraries the app needs. Takes a minute. You'll see a
  `node_modules` folder appear — that's normal, never edit it.

### 4. Start it
  ```
  npm run dev
  ```
  You'll see a line like `Local: http://localhost:5173/`.

### 5. View it
- Open that address in your browser: **http://localhost:5173**
- To see the **mobile layout** (bottom tab bar + mic button): open your browser's
  dev tools (F12), click the little phone/tablet icon, and pick a phone size. Or
  just drag the browser window narrow — it flips to mobile under 900px wide.

To stop the server: click the terminal and press `Ctrl + C`.

---

## Part 2 — What you're looking at

- **Home** — the running tally (total owed this month, with credit notes already
  subtracted), a **Needs Review** queue, bills sorted by due date, and a **Price
  Spikes** list.
- **Invoices** — tap any invoice to expand its line items; spiked prices show a red
  "was $X" flag. The **Upload** button runs a fake "reading invoice…" animation
  (the manual/photo backup path).
- **Materials** — latest price you've paid per item, pulled from invoice line items.
- **Suppliers** — add/edit via a bottom-sheet modal (try the **+ Add** button).
- **Account** — your profile and, importantly, your unique **forwarding email
  address** (the `@in.watchdog.app` bit) that suppliers' invoices get sent to.

### The demo "wow" moment
On mobile, tap the big **mic button** in the centre of the bottom bar. It simulates
a bill arriving by email — a toast pops up ("New bill from Reece Plumbing"), and a
new item appears in your **Needs Review** queue on the Home screen. Tap **Confirm**
and watch the running total tick up. That's the whole pitch in one gesture: the bill
showed up on its own.

(In the real app this happens automatically when a supplier emails the invoice —
the mic is just a stand-in trigger so you can demo it on demand. Wiring the mic to
real voice input is a later job.)

---

## Part 3 — Connecting the real backend (later, with your dev)

Everything talks to the backend through **`src/lib/api.js`**. Right now each function
returns mock data, with the real Supabase query written right beside it, commented
out. When the backend (the Supabase project from your architecture build) is
deployed:

1. Create a file called `.env` in the project root (copy `.env.example`) and fill in
   your Supabase URL and anon key.
2. Install the Supabase client:
   ```
   npm install @supabase/supabase-js
   ```
3. In `src/lib/api.js`, uncomment the client at the top and swap each function from
   the mock `return` to the real query above it.

Because every screen calls these `api.js` functions (never the mock data directly,
except the demo store), the UI keeps working as you switch them over one at a time.

### Field names already match your backend
The mock data in `src/lib/data/mock.js` uses the **same field names as your real
database** — `status` (`parsed`/`review`/`confirmed`), `doc_type`
(`invoice`/`credit_note`), `normalized_key`, `price_spike`, `prev_unit_price`, etc.
So there's no renaming when you connect the real tables.

---

## Notes / honest limitations
- This is **mock-data only** today. Buttons that "save" mutate local state and reset
  on refresh — that's expected until the backend is wired.
- The PWA bits (installable to home screen) are scaffolded (`manifest.json`,
  viewport meta) but you'll want real app icons in `static/` before launch.
- This was built React-free in **SvelteKit** to match your backend. If you ever saw
  a React version in chat, that was just a quick visual preview — this is the real one.

Stuck on any step? Copy the exact error from your terminal and send it back — that's
the fastest way to unblock.

---

## Update — Supplier "stock ticker" views

New since the first build:

- **Home now has a "Total Spend" chart** — per-month bars with W/M/6M/YTD/All
  toggles, plus a green/red change vs last month. Tap any bar to see that month's
  total. Below it, a **By Supplier** watchlist (top 3 by spend) with mini sparklines.
- **Each supplier is now tappable** (Suppliers tab → tap a row, or the Home
  watchlist) and opens its own **ticker page**: big total-spend number, change vs
  last month, the per-month bar chart with time toggles, and the recent invoices
  that make up the line. The **Edit details** button is still there for contact info.
- Bars tinted **amber** mark a month where a price spike landed — ties the Watchdog
  feature into the chart.

### Honest note on the chart data
The bars are **per-period (monthly) spend** — deliberately, so you can see spend
rise and fall month to month, not a smoothed line that invents movement between
invoices. On the mock data there are ~8 months seeded so it looks full. A real new
account starts with one or two months and fills out as invoices arrive — the time
toggles (W/M/6M/etc.) will all work but may look similar until there's history.

The monthly spend data lives in `src/lib/data/mock.js` (`spendHistory`). In
production this is a `GROUP BY month` query per wholesaler — a note to that effect is
in the file for your dev.

---

## Update — Dashboard rework + how-it-works docs

The dashboard is now built around the **5-second glance**:

- **Hero is now "Due This Week"** — the dollar amount hitting in the next 7 days,
  plus overdue count. This is the anti-surprise core, so it leads.
- An **"indicative only" note** sits under the hero — reminds the user their official
  totals live in Xero. Watchdog is the early warning, not the books.
- **Needs Review** and **Bills Due Soon** stay high (action + cash flow).
- **Price Spikes are now "confident matches only"** — the app only flags an item it
  could match to a previous order. If it can't match confidently, it stays silent.
  A wrong flag would kill trust; silence is safe.
- **Spend chart + supplier watchlist moved below** the essentials — they're the
  "open it when nothing's urgent" engagement views, not the glance.

### New: supplier "delivery status" + connection score
- Each supplier shows whether invoices arrive **Auto-sending / Forwarded / Manual**.
- The Suppliers screen has a **connection score** ("3 of 4 auto-sending") — turns the
  per-supplier setup into a visible goal. More connected = more complete dashboard.
- Each supplier page has an **Email [supplier]** button (opens your mail app
  pre-filled) and an **Invoice Delivery** section explaining how their invoices arrive.

### New docs in this folder
- **HOW-IT-WORKS.md** — plain-language explanation of the whole pipeline, how to set
  a supplier up to auto-send, how returns/credit notes affect totals, and the honest
  limits. Read this one.
- **workflow-diagram.mermaid** — the technical pipeline diagram for your developer.
  View it rendered by pasting the file contents into https://mermaid.live

---

## Update — Design viewer merged into SvelteKit

The React design-viewer iterations are now ported into this real SvelteKit app, so
the two are back in sync. What's new in the actual project:

**Home (`src/routes/+page.svelte`)**
- Hero with a **locked height** (no resize jump) and a 3-way toggle: 📈 trend (calm
  line chart, default) / # number / 🥧 mix (donut of supplier weighting).
- The **honest movement** under the total: `$X −$Y likely paid → $Z probably real`.
- A **Holdings-first / Alerts-first** view toggle.
- Holdings list with calm line sparklines; compact alert chips.

**Bills (`src/routes/invoices/+page.svelte`)** — NEW lifecycle page
- Three-total header (Owed / Likely paid / Probably real).
- Four tabs: **To Approve · Owed · Probably Paid · Paid** with live counts.
- Working status buttons (Confirm → Owed, Mark Paid, Restore, Confirm Paid).
- Plain-English **explainer**: bills 14+ days overdue are auto-assumed paid and
  moved to Probably Paid (never deleted). States the Xero-is-truth position.

**New components** (`src/lib/components/`): `LineChart`, `MiniLine`, `Donut`,
`InvoiceModal` (mocked document viewer with Save to Files/Photos/Share).

**Data** (`src/lib/data/mock.js`): added `months`, `spendHistory` (6-month),
`spendTotalHistory`, `holdings`, `billsSeed` (with paid-status lifecycle), `spikes`.

### Still honest about limits
Everything runs on mock data. The bill status changes, the "probably paid" aging,
the invoice viewer's Save/Share — all work in-memory or are mocked. They wire to the
real Supabase backend (which still needs deploying) through `src/lib/api.js`.
