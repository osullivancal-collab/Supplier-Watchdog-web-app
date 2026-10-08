# Wholesaler Watchdog

See supplier bills coming before they hit. A phone-first PWA that treats your
suppliers like a portfolio: what you owe, what's due ahead, who's taking your
money, and leverage to bargain with.

**Status:** React + Vite PWA running on **sample data**. Email-in (bills
forwarded to your own address and read automatically) is the next stage.
The SvelteKit version is kept on the branch `backup/initial-sveltekit-2026-10-08`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for every calculation (src/lib/model.test.js)
npm run build
npm run smoke      # after build: drives the real app in Chromium at iPhone size
```

## How it fits together

| Path | What it is |
|---|---|
| `src/data/sample.js` | Sample bills, prices and deals — shaped exactly like the real records will be |
| `src/lib/model.js` | Every number on screen, as pure functions (owed balance, bill shock, monthly spend, supplier ranking, deal progress, price gaps) |
| `src/lib/store.js` | What the user has done on top of the data (confirm, mark paid, alerts, deals). Kept in `localStorage` for now |
| `src/lib/insights.js` | Runs the model once per change and hands results to the screens |
| `src/screens/*` | Market, Bills, Watch, League, Supplier page, Counter mode |
| `src/components/*` | Charts (step chart, bars, mix, gauge), sheets, signature pad |
| `public/sw.js`, `public/manifest.webmanifest` | Offline support and "Add to Home Screen" |

Key decisions:

- **Charts are honest about sparse data.** What you owe only changes when a bill
  arrives or is paid, so it's drawn as steps — each step is a real bill. Right of
  "today", a dashed line steps down on each due date: that's the bill shock.
- **Nothing is stored that can be worked out.** Deal progress, supplier share,
  bill shock and the Basket Index are all derived from bills, so they can never
  drift out of date.
- **Bill shock** = next 30 days due ÷ what normally falls due in 30 days
  (average of the last 180 days). 50 is normal; each 10% above adds 7 points.
- **Colour means something:** orange = costing more, blue = costing less, lime =
  the one main action on a screen.

## Deploy

Vercel builds this with `vercel.json` (Vite, output `dist`). The Vercel project
is still set to the SvelteKit framework preset — switch it to Vite (or let
`vercel.json` override it) before the first production deploy.

## Next: email-in

Port the generic pieces from the SoleTasker pattern into this repo (no shared
code, keys or Supabase project): Resend inbound webhook with signature check,
attachment validation and text extraction, per-account forwarding token, rate
limits. Then a new invoice reader (supplier, invoice number, dates, total, GST,
line items) feeding a new Supabase project. Line items are what powers Watch and
the price leverage — no extra AI call.
