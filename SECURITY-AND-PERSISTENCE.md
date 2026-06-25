# Wholesaler Watchdog — Security & Persistence Plan

This document covers what must be in place before the frontend connects to live
data. It is written for the backend build (Supabase). The guiding principle from
the architecture sessions still holds: **AI only converts documents to JSON; all
financial calculations are deterministic server-side code.**

---

## 1. Authentication

Use **Supabase Auth**. Recommended: email magic-link (lowest friction for tradies
on phones) with email/password as a fallback.

Requirements:
- Every API route and every database query runs in the context of an authenticated
  session. No anonymous reads of user data.
- The session JWT is the source of `auth.uid()` used by all RLS policies below.
- Server-only contexts (the email ingestion webhook) use the **service-role key**,
  which bypasses RLS. This key is never exposed to the browser and lives only in
  server environment variables.
- Session-authenticated clients (everything the user touches in-app) use the
  **anon key** + the user's JWT, so RLS applies.

---

## 2. Row-Level Security (RLS)

RLS must be enabled on **every** table holding user data. Without it, any
authenticated user could read every other user's invoices. This is non-negotiable
for a multi-tenant app.

Every user-owned table needs a `user_id uuid` column referencing `auth.users(id)`,
and a policy that scopes rows to the current user.

Tables requiring RLS:
- `profiles`
- `wholesalers`
- `invoices`
- `line_items` (scoped via parent invoice's `user_id`)
- `failed_ingests`
- `deals` (new — see §4)

Standard policy pattern (apply per table, adjusting for joins where the
`user_id` lives on a parent):

```sql
alter table invoices enable row level security;

create policy "own rows - select"
  on invoices for select
  using (auth.uid() = user_id);

create policy "own rows - insert"
  on invoices for insert
  with check (auth.uid() = user_id);

create policy "own rows - update"
  on invoices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows - delete"
  on invoices for delete
  using (auth.uid() = user_id);
```

For `line_items` (no direct `user_id`, scoped through `invoices`):

```sql
alter table line_items enable row level security;

create policy "own line items"
  on line_items for all
  using (
    exists (
      select 1 from invoices i
      where i.id = line_items.invoice_id
        and i.user_id = auth.uid()
    )
  );
```

### Service-role inserts (the webhook)
The email-ingestion webhook arrives with no user session. It must resolve the
owning user from the **inbound email address** (the per-user minted address) and
set `user_id` explicitly on insert. Because it uses the service-role key, RLS is
bypassed — so the webhook code itself is responsible for setting the correct
`user_id`. Treat that resolution step as security-critical: a bug there could
write one user's invoice into another's account.

---

## 3. Storage policies

Invoice source files (PDFs, photos) live in Supabase Storage. The bucket must be
**private** (not public), with policies that scope objects to the owning user.
Use a path convention of `{user_id}/{invoice_id}/{filename}` and enforce it:

```sql
create policy "own files - read"
  on storage.objects for select
  using ( auth.uid()::text = (storage.foldername(name))[1] );

create policy "own files - write"
  on storage.objects for insert
  with check ( auth.uid()::text = (storage.foldername(name))[1] );
```

Serve files to the frontend via short-lived **signed URLs**, never public URLs.

---

## 4. The `deals` table (new this build)

Supplier Deals are private commercial data — a tradie's verbal agreements and
negotiation targets. They are arguably **more sensitive** than invoices because
they reveal negotiating position. RLS is mandatory.

### Schema

```sql
create table deals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  wholesaler_id uuid references wholesalers(id) on delete set null,
  name          text not null,
  target        text not null,           -- free text: "$5,000", "70%", "Below 5%"
  end_date      date not null,
  status        text not null default 'active'
                  check (status in ('active', 'completed')),
  result        text check (result in ('won', 'lost')),  -- null while active
  reward        text,                     -- optional ("Milwaukee Packout")
  created_at    timestamptz not null default now()
);

alter table deals enable row level security;

create policy "own deals" on deals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index deals_user_status_idx on deals (user_id, status);
create index deals_user_supplier_idx on deals (user_id, wholesaler_id);
```

### What is NOT stored
- **`current_value`** (live progress toward target) — computed on read from
  invoice data, never stored. Storing it would let it go stale, breaking the
  honesty principle. Calculate it deterministically: for a `$` target, sum this
  month's invoices for that supplier; for a `%` target, that supplier's spend ÷
  total spend this month.
- **`final_value`** — the one exception. When a deal's `end_date` passes,
  snapshot the final computed value into a stored column so history stays
  accurate even as future spend changes. (Add `final_value numeric` if you want
  to display the closing number in history; otherwise recompute against the
  frozen month.)

### Lifecycle
- Deals **auto-end** at `end_date` (status flips to `completed` by a scheduled
  job — Supabase cron / pg_cron, or computed at read-time if you prefer no cron).
- `result` (won/lost) is set **manually by the user** in V1. Do not auto-decide
  win/loss — the tradie may know context the data doesn't.
- History is shown for **6 months**; older deals can be archived or just filtered
  out of the default query (`end_date > now() - interval '6 months'`).

---

## 5. What persists vs. what is ephemeral

Persist (survives across devices and sessions):
- All invoices, line items, suppliers, profiles
- All deals and their won/lost history
- User profile + minted inbound email address

Do **not** persist (deliberately session-only / client-only):
- The **eye-icon blocking state** in the Medal Modal — resets every time the app
  opens, by design. Keep it in component state only; never write it to the DB.
- UI state like which hero tab (trend/stats/mix) is selected, period toggles,
  holdings-vs-alerts order.

---

## 6. API authorization checklist

Every endpoint must verify the session and scope to `auth.uid()`:

- `POST /api/upload` — manual invoice upload. Verify session; set `user_id` from
  the session, not from the request body.
- `POST /api/invoices/override` — header/line-item edits, total recompute, status
  promotion. Verify the invoice being edited belongs to the caller.
- `POST /api/deals` / `PATCH /api/deals/:id` — create/update agreements. Verify
  ownership on update.
- Email webhook — verify the **provider signature** (Postmark/Mailgun) before
  processing. Resolve `user_id` from the inbound address. Reject unsigned or
  unrecognized senders.

---

## 7. Secrets

Never client-side. Store in Supabase project env / Edge Function secrets:
- Anthropic API key
- Postmark/Mailgun webhook signing secret
- Service-role key

The browser only ever sees the Supabase anon key and the user's own JWT.

---

## 8. Build order recommendation

1. Auth + `profiles` with auto-mint inbound address trigger on signup (already
   designed).
2. RLS on all existing tables — verify with a two-account test that neither can
   read the other's rows.
3. `deals` table + RLS.
4. Wire `src/lib/api.js` stubs to real queries, one screen at a time, starting
   with the invoice list (highest-traffic read).
5. Storage bucket + signed URLs for invoice source files.
6. Scheduled job (or read-time computation) for deal auto-end.

The frontend is built against mock data that mirrors these table shapes
field-for-field, so swapping in real queries should be mechanical once RLS is
verified.
