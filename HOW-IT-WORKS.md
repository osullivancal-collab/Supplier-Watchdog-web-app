# How Wholesaler Watchdog Actually Works

This explains the moving parts in plain language: how an invoice gets from a
supplier's counter into your dashboard, how returns affect the numbers, and the
honest limits of what the app is (and isn't).

---

## What this app IS — and what it isn't

**It is:** an early-warning dashboard. A 5-second glance at what bills are coming,
what you've been spending, and whether a supplier has quietly raised a price.

**It is NOT:** your books. The official, to-the-cent total you pay is whatever's in
**Xero** when you pay the invoice. Some invoices won't make it into Watchdog (a
supplier forgot to email, a paper docket got binned, a parse failed). That's fine —
Watchdog is the heads-up, Xero is the truth. The app says this on the dashboard so
no one mistakes it for accounting.

The practical upshot: **Watchdog is only as complete as the workflow the user dials
in.** The more suppliers set to auto-send, the closer the picture. That's why the
Suppliers screen shows a "connected" score — it's nudging completeness.

---

## The workflow (the pipeline)

```
  SUPPLIER                YOU                      WATCHDOG                    YOU
  ─────────               ─────                    ──────────                  ─────
                                                                            
  Invoice    ──email──►   (nothing to do)  ──►     Inbound email     ──►     See it on
  emailed                                          received                  dashboard
  to your                                            │                       within seconds
  unique addr                                        ▼
                                                   AI reads the file
                                                   → vendor, total,
                                                     due date, line items
                                                     (returns JSON)
                                                     │
                                                     ▼
                                                   Saved as "REVIEW"
                                                   (not trusted yet)
                                                     │
                          Tap "Confirm" ◄────────────┘
                                │
                                ▼
                          Now "CONFIRMED"
                          → counts in totals
                          → price checked vs
                            last order
```

A fuller version of this diagram (the technical one for your developer) is in
`workflow-diagram.mermaid` — open it at https://mermaid.live to view it rendered.

### The three ways an invoice gets in

1. **Auto-send (best).** The supplier emails the invoice straight to your unique
   Watchdog address. You do nothing. (Setup below.)
2. **Forwarded.** A rule in your Gmail/Outlook auto-forwards anything from that
   supplier to Watchdog. Catches suppliers who email *you*, not the app.
3. **Manual.** You photograph or upload a paper docket. The catch-all.

The app can't *force* a supplier to send anything — so #1 and #2 are setup the user
does once per supplier. #3 is always available as backup.

---

## Setting up a supplier to always send invoices

This is the single most important thing a user does. Each supplier, once:

**Option A — set your account billing email (most reliable)**
1. At the trade counter (or by calling the supplier), ask them to set the **billing
   / invoice email** on your trade account to your Watchdog address — the one on your
   Account screen, e.g. `u_a1b2c3@in.watchdog.app`.
2. From then on, every invoice they raise emails itself into Watchdog automatically.
3. The supplier shows as **Auto-sending** (green) in the app.

**Option B — forward rule (if they email you directly)**
1. In Gmail/Outlook, create a filter: *from* `@reece.com.au` → *forward to* your
   Watchdog address.
2. The supplier shows as **Forwarded**.

**Option C — manual (no setup)**
- Just snap a photo or upload the PDF. The supplier stays **Manual only** — fine for
  the odd one, but you'll miss any you forget. The app nudges you to set up A or B.

The Suppliers screen tracks this as a score ("3 of 5 auto-sending") to encourage
getting them all connected — the more connected, the more complete the dashboard.

---

## How returns / credit notes work

When you return goods, the supplier issues a **credit note** (a negative invoice).
Watchdog handles these so your spend doesn't look inflated:

- The AI detects whether a document is an **invoice** or a **credit note**.
- A credit note is stored with a **negative total** (e.g. −$213.00).
- It **subtracts** from your running spend and from that supplier's totals.
- In the invoice list it's tagged **CREDIT** and shown in green.

Example: you spent $926 with Reece, then returned $213 of taps. Your Reece total
reads **$713**, not $926. The credit note rides through the same pipeline as a normal
invoice — no special handling by the user.

**Honest limit:** this only works if the credit note actually reaches the app (same
delivery problem as invoices). And because Watchdog isn't your books, treat the
adjusted figure as indicative — the real reconciliation happens in Xero.

---

## Emailing a supplier from the app

On a supplier's page, **Email [supplier]** opens your phone's normal mail app with
the address, your account number, and a short template pre-filled. Handy for "where's
my invoice?" or a price query.

**Honest note:** this uses a standard `mailto:` link — it hands off to your real mail
app rather than sending from inside Watchdog. True in-app sending (so replies come
back into the app) needs the backend and a verified sender address; it's a later job.
For now, hand-off-to-mail is what most tradies expect anyway.

---

## The honest limits, in one place

- **Completeness depends on setup.** Unconnected suppliers = missing invoices.
- **Not your books.** Xero is the source of truth at payment.
- **Price spikes are confident-match only.** If we can't match an item to a previous
  order, we stay silent rather than guess. Better to miss one than cry wolf.
- **Parsing isn't perfect.** That's why every invoice lands in "Review" first — you
  confirm before it counts.
