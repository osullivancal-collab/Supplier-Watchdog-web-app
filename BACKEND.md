# Watchdog backend

Login, a real database, paid plans and "snap a docket" reading. Most of it is
copied from SoleTasker's backend, which has been running in production, so
Watchdog doesn't repeat that work. **Nothing is switched on yet.** Until the
setup steps below are done, the app runs exactly as it does today: everything
stays on the phone.

Watchdog has its **own** Supabase project, Stripe product and keys. Nothing is
shared with SoleTasker, and SoleTasker's code was only read, never changed.

## What came from SoleTasker

| Piece | Watchdog file | How much changed |
|---|---|---|
| Retry/backoff for OpenAI and Stripe calls | `api/_provider.js` | Copied as is |
| Rate limits, usage ledger, webhook de-dupe | `api/_security.js` | Copied; only the limits table is new |
| Sign-in check, paid-access check | `api/_auth.js` | Same approach, Watchdog wording |
| Image checks (real JPEG/PNG/WebP bytes), date checks | `api/_validation.js` | Copied, unused parts dropped |
| AI cost tracking | `api/_ai-cost.js` | Copied, token pricing only |
| Stripe checkout / billing portal / webhook | `api/stripe/*.js`, `api/_billing.js`, `api/_origin.js` | Same logic; adds a monthly/yearly choice; writes a locked billing table (see below) |
| Rate-limit and webhook tables + database functions | `supabase/migrations/001_watchdog_schema.sql` | From SoleTasker migrations 013 + 044; voice-memo parts removed |
| Free trial, read-only after it ends, founder/family accounts that never pay | same file | From SoleTasker 025/026/029; trial is 14 days |

## What's new for Watchdog

- **Tables:** `suppliers`, `bills` (credits are negative), `bill_lines` (where
  price tracking comes from), `deals` (signed at the counter; progress is
  worked out from bills, never stored), `price_alerts`, `disputes`.
  Every table only shows a person their own rows, and a bill can only point
  at that person's own supplier.
- **Docket photos:** a private `dockets` storage bucket, one folder per account.
- **Invoice reader** (`api/invoice-read.js`, `api/_invoice-extract.js`): 1–3
  photos of one bill → supplier, invoice number, dates, total, GST, job and
  line items. The AI only *reads*. Plain code then checks the numbers: do the
  lines add up, is GST about a tenth, is the due date after the invoice date,
  is this a statement or quote rather than a bill. The tradie sees those flags
  and confirms before anything is saved.
- **App side**, switched on once the keys exist:
  - First screen is sign-in by emailed link, with "Just look around" for the
    sample data on the phone.
  - Signed in, every change is saved to the database first and only shown once
    it's saved (`src/lib/remote.js`). If a save fails, the old value stays and
    the tradie is told why ("trial ended", "already in", "no connection").
  - Snap a docket reads the photo and fills the form, with any warnings shown,
    and matches the supplier name to one of theirs ("REECE AUSTRALIA PTY LTD" → Reece).
  - Photos go to private storage; another phone gets a short-lived link.
  - Account shows the plan (trial days left / subscribed / payment failed),
    Monthly / Yearly / Manage billing, business name, and sign out. Home shows a
    banner when the trial is nearly over or has ended.
  - Data refreshes when the app comes back to the front, so two devices stay in step.

## One thing done differently on purpose

In SoleTasker, the plan status (`subscription_status`, `trial_ends_at`) sits
on the `profiles` row, and the database lets a signed-in person edit their
own profile row. Watchdog keeps plan status in `account_billing`, which a
person can read but only Stripe's webhook can write. The database tests prove
a user can't give themselves a paid plan, a longer trial, or a free-forever
flag. (SoleTasker itself has not been changed. That's a separate decision.)

## Tests

- `npm test`: model, store and API tests (`test/api.test.js`). The API tests cover:
  - the sign-in, plan and file checks on invoice reading;
  - the GST and line-total checks;
  - Stripe signature checking and each billing event.
- `npm run test:db`: builds a throwaway local Postgres, installs the schema
  and tries to break it. Checks include:
  - reading another account's bills;
  - pointing a bill at someone else's supplier;
  - giving yourself a paid plan;
  - writing after the trial ends;
  - uploading into someone else's photo folder;
  - rate limits;
  - a failed read not using up the month;
  - a Stripe event processed twice.

  It never touches a real database.
- `npm run smoke`: the whole app in a real browser.

## Setup

Callan said yes to all of it on 2026-10-09, on one condition: nothing of
SoleTasker's is touched, anywhere (see CLAUDE.md).

0. **Callan: make a new Supabase organisation called Watchdog.** The only
   organisation today is SoleTasker's, and Watchdog must not live inside it.

1. **Create a new Supabase project** for Watchdog (free plan is fine to start; Sydney region).
2. **Run `001_watchdog_schema.sql`** in that project.
3. **Turn on email sign-in links** in Supabase → Authentication, and set the site URL.
4. **Stripe:** create the Watchdog product with a monthly and a yearly price,
   turn on Stripe Tax (checkout asks Stripe to add GST; copied from SoleTasker),
   and a webhook pointing at `/api/stripe/webhook` with the six events listed
   in `api/stripe/webhook.js`.
5. **Vercel environment variables:** the names are in `.env.example`.
   Production and preview get separate Stripe keys (test keys on preview).
6. **Merge to main** once the screens are wired up (next step).

## Not built yet

- Forward-your-bills email address (SoleTasker's email intake is the model; the
  limits and the per-account token are already in place).
- Account deletion (SoleTasker 040/047 and its purge job are the model).
- Emails when a payment fails or access comes back (SoleTasker's
  `send-subscription-email` is the model).
