-- Wholesaler Watchdog — first schema.
--
-- For a NEW, Watchdog-only Supabase project. Never run this against SoleTasker's
-- project: the two products share no database, keys or users.
--
-- Where this came from. The security, billing and limits pieces are copied from
-- SoleTasker's production migrations, which have been live and hardened there:
--   api_usage_events / provider_webhook_events + reserve/finish/claim RPCs  ← SoleTasker 013 + 044
--   billing_access_overrides + the three subscription-access functions       ← SoleTasker 025/026/029
--   enforce_active_write_access trigger (read-only after trial)              ← SoleTasker 026/032
-- The voice-memo branch of reserve_api_action is removed (Watchdog has no
-- voice memos), and the monthly allowance uses 044's rule: failed scans don't
-- use up the month's allowance.
--
-- One deliberate change from SoleTasker: billing state does NOT live on
-- `profiles`. In SoleTasker a signed-in user may update their own profile row,
-- and that row also holds subscription_status / trial_ends_at, so the
-- database alone doesn't stop a user writing their own paid status. Here
-- billing lives in `account_billing`, which browser roles can read but never
-- write; only the Stripe webhook (service role) writes it. Profiles are
-- writable column-by-column, so even the intake token can't be changed from
-- the browser.
--
-- Money is numeric(12,2) dollars incl. GST, matching what's printed on a bill.
-- Credits/returns are negative totals. Dates are real dates (YYYY-MM-DD), never
-- "days from today".
--
-- Wrapped in a transaction so a partial run in the SQL Editor can't leave a
-- table with RLS on and no policy.

begin;

-- ============================================================
-- Accounts
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  owner_name text check (char_length(owner_name) <= 120),
  business_name text check (char_length(business_name) <= 160),
  abn text check (abn ~ '^[0-9 ]{11,14}$'),
  -- The private part of the forward-your-bills address: <token>@<INTAKE_EMAIL_DOMAIN>.
  -- Generated server-side, 20+ unguessable characters, never chosen by the user.
  intake_email_token text unique check (intake_email_token ~ '^[a-z0-9]{20,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_intake_token_idx on public.profiles (lower(intake_email_token));

alter table public.profiles enable row level security;
create policy "own profile - read" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "own profile - update" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Rows are created by the signup trigger only; the browser may change these
-- columns and nothing else.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (owner_name, business_name, abn, updated_at) on public.profiles to authenticated;

create table public.account_billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text not null default 'inactive',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.account_billing enable row level security;
create policy "own billing - read" on public.account_billing for select to authenticated
  using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.account_billing from public, anon, authenticated;
grant select, insert, update, delete on public.account_billing to service_role;

-- Founder / family / tester accounts that never pay. Service-managed only.
create table public.billing_access_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_type text not null default 'grandfathered' check (access_type in ('grandfathered')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.billing_access_overrides enable row level security;
revoke all on public.billing_access_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.billing_access_overrides to service_role;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, owner_name, intake_email_token)
  values (
    new.id, new.email, left(new.raw_user_meta_data->>'name', 120),
    -- 32 lowercase hex chars from a random UUID (122 random bits); not derived from the user.
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
  );
  insert into public.account_billing (user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Paid access: 14-day trial, no card. (SoleTasker 029, moved onto account_billing.)
-- ============================================================

-- Browser check. Starts the trial the first time a signed-in user asks.
create or replace function public.get_my_subscription_access()
returns table(subscription_status text, trial_started_at timestamptz, trial_ends_at timestamptz, trial_active boolean, has_access boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_grandfathered boolean;
begin
  if v_uid is null then return; end if;
  select exists (select 1 from public.billing_access_overrides b where b.user_id = v_uid) into v_grandfathered;

  if not v_grandfathered then
    update public.account_billing a
       set trial_started_at = now(), trial_ends_at = now() + interval '14 days', updated_at = now()
     where a.user_id = v_uid and a.trial_started_at is null and a.trial_ends_at is null
       and a.stripe_subscription_id is null and a.subscription_status not in ('active', 'trialing');
  end if;

  return query
  select
    case when v_grandfathered then 'grandfathered'::text else a.subscription_status end,
    a.trial_started_at, a.trial_ends_at,
    (not v_grandfathered and a.stripe_subscription_id is null and coalesce(a.trial_ends_at > now(), false)),
    (v_grandfathered or a.subscription_status in ('active', 'trialing')
       or (a.stripe_subscription_id is null and coalesce(a.trial_ends_at > now(), false)))
  from public.account_billing a where a.user_id = v_uid;
end;
$$;
revoke all on function public.get_my_subscription_access() from public, anon;
grant execute on function public.get_my_subscription_access() to authenticated;

create or replace function public.has_active_write_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_billing a
     where a.user_id = auth.uid()
       and (exists (select 1 from public.billing_access_overrides b where b.user_id = a.user_id)
            or a.subscription_status in ('active', 'trialing')
            or (a.stripe_subscription_id is null and a.trial_ends_at > now()))
  );
$$;
revoke all on function public.has_active_write_access() from public, anon;
grant execute on function public.has_active_write_access() to authenticated, service_role;

-- Server check for the paid API routes (invoice reading, email-in).
create or replace function public.get_subscription_access_for_user(p_user_id uuid)
returns table(subscription_status text, trial_ends_at timestamptz, trial_active boolean, has_access boolean)
language sql stable security definer set search_path = '' as $$
  with g as (select exists (select 1 from public.billing_access_overrides b where b.user_id = p_user_id) as on_)
  select
    case when g.on_ then 'grandfathered'::text else a.subscription_status end,
    a.trial_ends_at,
    (not g.on_ and a.stripe_subscription_id is null and coalesce(a.trial_ends_at > now(), false)),
    (g.on_ or a.subscription_status in ('active', 'trialing')
       or (a.stripe_subscription_id is null and coalesce(a.trial_ends_at > now(), false)))
  from public.account_billing a, g where a.user_id = p_user_id;
$$;
revoke all on function public.get_subscription_access_for_user(uuid) from public, anon, authenticated;
grant execute on function public.get_subscription_access_for_user(uuid) to service_role;

-- After the trial ends without paying, the account goes read-only: you can
-- still see everything, you just can't add or change it.
create or replace function public.enforce_active_write_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Server (service role) writes have no auth.uid(); endpoints check access themselves.
  if auth.uid() is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if not public.has_active_write_access() then
    raise exception 'WATCHDOG_READ_ONLY' using errcode = '42501',
      detail = 'An active trial or subscription is needed to change Watchdog data.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.enforce_active_write_access() from public, anon, authenticated;

-- ============================================================
-- Watchdog's own data
-- ============================================================

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  terms text check (terms in ('COD', '7 days', '14 days', '30 days', 'EOM', '30 days EOM')),
  rep text check (char_length(rep) <= 120),
  phone text check (char_length(phone) <= 40),
  account_no text check (char_length(account_no) <= 60),
  branch text check (char_length(branch) <= 120),
  -- The account's credit limit (caps the unpaid balance). Optional; the meter only shows when set.
  credit_limit numeric(12, 2) check (credit_limit is null or credit_limit > 0),
  -- Sender domains seen on this supplier's emailed bills, so email-in can match them.
  email_domains text[] not null default '{}' check (cardinality(email_domains) <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index suppliers_user_name_idx on public.suppliers (user_id, lower(name));

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  vendor_name text check (char_length(vendor_name) <= 160),   -- when there's no supplier record (Telstra etc.)
  ref text check (char_length(ref) <= 80),
  total numeric(12, 2) not null check (total between -1000000 and 10000000),  -- negative = credit/return
  gst numeric(12, 2) check (gst is null or abs(gst) <= abs(total)),
  issued_on date not null,
  due_on date not null check (due_on between issued_on and issued_on + 400),
  paid_on date,
  job text check (char_length(job) <= 120),
  -- 'pending' = arrived by email or photo and waiting for the user to confirm.
  status text not null default 'confirmed' check (status in ('pending', 'confirmed')),
  source text not null default 'manual' check (source in ('manual', 'photo', 'email')),
  confidence smallint check (confidence between 0 and 100),
  photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bills_user_due_idx on public.bills (user_id, due_on) where paid_on is null;
create index bills_user_issued_idx on public.bills (user_id, issued_on desc);
create index bills_supplier_idx on public.bills (supplier_id);
-- The same supplier invoice number twice is a duplicate, not a second bill.
create unique index bills_user_supplier_ref_idx on public.bills (user_id, supplier_id, lower(ref))
  where ref is not null and supplier_id is not null;

-- Line items: where price tracking comes from. Optional — a bill without lines still works.
create table public.bill_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  position smallint not null default 0,
  sku text check (char_length(sku) <= 60),
  description text not null check (char_length(description) between 1 and 300),
  qty numeric(12, 3),
  unit text check (char_length(unit) <= 30),
  unit_price numeric(12, 4),
  line_total numeric(12, 2)
);
create index bill_lines_bill_idx on public.bill_lines (bill_id);
create index bill_lines_user_sku_idx on public.bill_lines (user_id, lower(sku)) where sku is not null;

-- Deals signed at the counter. Progress is never stored: it's worked out from bills.
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  kind text not null check (kind in ('spend', 'share')),
  target numeric(12, 2) not null check (target > 0 and (kind <> 'share' or target <= 100)),
  reward text not null check (char_length(reward) between 1 and 200),
  rep text check (char_length(rep) <= 120),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),   -- "end of month" on the last day ends today
  -- Signatures as small SVG path strings, as drawn on the phone.
  signature_you text check (char_length(signature_you) <= 100000),
  signature_rep text check (char_length(signature_rep) <= 100000),
  signed_at timestamptz,
  result text check (result in ('won', 'lost')),   -- set by the user, never guessed
  final_value numeric(12, 2),                      -- snapshot when the deal ends
  created_at timestamptz not null default now()
);
create index deals_user_supplier_idx on public.deals (user_id, supplier_id);

create table public.price_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 120),
  at_price numeric(12, 2) not null check (at_price > 0),
  enabled boolean not null default true,
  primary key (user_id, item_key)
);

-- "Watchdog caught" items the user disputed or dismissed, so they stop showing.
create table public.disputes (
  user_id uuid not null references auth.users(id) on delete cascade,
  catch_key text not null check (char_length(catch_key) between 1 and 200),
  outcome text not null default 'sent' check (outcome in ('sent', 'dismissed', 'credited')),
  created_at timestamptz not null default now(),
  primary key (user_id, catch_key)
);

-- Row-level security: each person sees only their own rows, and anything that
-- points at a supplier or bill must point at one of their own.
alter table public.suppliers enable row level security;
alter table public.bills enable row level security;
alter table public.bill_lines enable row level security;
alter table public.deals enable row level security;
alter table public.price_alerts enable row level security;
alter table public.disputes enable row level security;

create policy "own suppliers" on public.suppliers for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own bills" on public.bills for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
    and (supplier_id is null or exists (select 1 from public.suppliers s where s.id = supplier_id and s.user_id = (select auth.uid())))
    and (photo_path is null or photo_path like (select auth.uid())::text || '/%'));

create policy "own bill lines" on public.bill_lines for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.bills b where b.id = bill_id and b.user_id = (select auth.uid())));

create policy "own deals" on public.deals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.suppliers s where s.id = supplier_id and s.user_id = (select auth.uid())));

create policy "own alerts" on public.price_alerts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own disputes" on public.disputes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

do $block$
declare t text;
begin
  foreach t in array array['profiles', 'suppliers', 'bills', 'bill_lines', 'deals', 'price_alerts', 'disputes'] loop
    execute format('create trigger subscription_write_guard before insert or update or delete on public.%I
                    for each row execute function public.enforce_active_write_access()', t);
  end loop;
end
$block$;

-- ============================================================
-- Docket photos: private bucket, files under <user_id>/...
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dockets', 'dockets', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "own dockets - read" on storage.objects for select to authenticated
  using (bucket_id = 'dockets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own dockets - add" on storage.objects for insert to authenticated
  with check (bucket_id = 'dockets' and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_active_write_access());
create policy "own dockets - remove" on storage.objects for delete to authenticated
  using (bucket_id = 'dockets' and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_active_write_access());

-- ============================================================
-- Abuse protection and webhook de-duplication (SoleTasker 013 + 044)
-- ============================================================

create table public.api_usage_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  user_id uuid references auth.users(id) on delete set null,
  scope_key_hash text not null,
  idempotency_key_hash text,
  period_key text,
  state text not null check (state in ('reserved', 'succeeded', 'failed', 'rejected', 'released')),
  error_category text,
  provider text,
  provider_request_id text,
  input_bytes bigint,
  input_units bigint,
  output_units bigint,
  estimated_cost_usd numeric(12, 6),
  duration_ms integer,
  lease_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index api_usage_idempotency_idx on public.api_usage_events (action, scope_key_hash, idempotency_key_hash)
  where idempotency_key_hash is not null and state in ('reserved', 'succeeded');
create index api_usage_scope_window_idx on public.api_usage_events (action, scope_key_hash, created_at desc);
create index api_usage_user_period_idx on public.api_usage_events (user_id, action, period_key, created_at desc);
create index api_usage_state_lease_idx on public.api_usage_events (state, lease_expires_at) where state = 'reserved';
alter table public.api_usage_events enable row level security;
revoke all on public.api_usage_events from public, anon, authenticated;

create table public.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  state text not null check (state in ('processing', 'succeeded', 'failed')),
  lease_expires_at timestamptz,
  error_category text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
alter table public.provider_webhook_events enable row level security;
revoke all on public.provider_webhook_events from public, anon, authenticated;

create or replace function public.reserve_api_action(
  p_action text, p_user_id uuid, p_scope_key_hash text, p_idempotency_key_hash text,
  p_window_seconds integer, p_burst_limit integer, p_concurrency_limit integer,
  p_period_key text, p_period_limit integer, p_daily_limit integer, p_global_daily_limit integer,
  p_lease_seconds integer, p_input_bytes bigint, p_metadata jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_event_id uuid;
  v_existing public.api_usage_events%rowtype;
  v_count bigint;
begin
  if p_action is null or p_scope_key_hash is null or p_window_seconds < 1 or p_burst_limit < 1
     or p_concurrency_limit < 1 or p_lease_seconds < 1 then
    raise exception 'invalid abuse-control configuration';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_action || ':' || p_scope_key_hash, 0));

  -- Expired leases stop holding a slot. One-shot: only 'reserved' rows move.
  update public.api_usage_events
     set state = 'failed', error_category = 'lease_expired', completed_at = v_now
   where state = 'reserved' and lease_expires_at <= v_now;

  if p_idempotency_key_hash is not null then
    select * into v_existing from public.api_usage_events
     where action = p_action and scope_key_hash = p_scope_key_hash
       and idempotency_key_hash = p_idempotency_key_hash and state in ('reserved', 'succeeded')
     limit 1;
    if found then
      return pg_catalog.jsonb_build_object(
        'allowed', false,
        'code', case when v_existing.state = 'succeeded' then 'DUPLICATE_REQUEST' else 'REQUEST_IN_PROGRESS' end,
        'retry_after', case when v_existing.state = 'reserved'
          then greatest(1, extract(epoch from (v_existing.lease_expires_at - v_now))::integer) else null end,
        'event_id', v_existing.id);
    end if;
  end if;

  select count(*) into v_count from public.api_usage_events
   where action = p_action and scope_key_hash = p_scope_key_hash
     and state in ('reserved', 'succeeded', 'failed')
     and created_at > v_now - pg_catalog.make_interval(secs => p_window_seconds);
  if v_count >= p_burst_limit then
    insert into public.api_usage_events(action, user_id, scope_key_hash, period_key, state, error_category, input_bytes, metadata)
    values (p_action, p_user_id, p_scope_key_hash, p_period_key, 'rejected', 'burst_limit', p_input_bytes, coalesce(p_metadata, '{}'::jsonb));
    return pg_catalog.jsonb_build_object('allowed', false, 'code', 'RATE_LIMITED', 'retry_after', p_window_seconds);
  end if;

  select count(*) into v_count from public.api_usage_events
   where action = p_action and scope_key_hash = p_scope_key_hash and state = 'reserved' and lease_expires_at > v_now;
  if v_count >= p_concurrency_limit then
    insert into public.api_usage_events(action, user_id, scope_key_hash, period_key, state, error_category, input_bytes, metadata)
    values (p_action, p_user_id, p_scope_key_hash, p_period_key, 'rejected', 'concurrency_limit', p_input_bytes, coalesce(p_metadata, '{}'::jsonb));
    return pg_catalog.jsonb_build_object('allowed', false, 'code', 'TOO_MANY_IN_FLIGHT', 'retry_after', p_lease_seconds);
  end if;

  if p_daily_limit is not null then
    select count(*) into v_count from public.api_usage_events
     where action = p_action and scope_key_hash = p_scope_key_hash
       and state in ('reserved', 'succeeded', 'failed') and created_at >= pg_catalog.date_trunc('day', v_now);
    if v_count >= p_daily_limit then
      insert into public.api_usage_events(action, user_id, scope_key_hash, period_key, state, error_category, input_bytes, metadata)
      values (p_action, p_user_id, p_scope_key_hash, p_period_key, 'rejected', 'daily_safety_limit', p_input_bytes, coalesce(p_metadata, '{}'::jsonb));
      return pg_catalog.jsonb_build_object('allowed', false, 'code', 'DAILY_SAFETY_LIMIT', 'retry_after', 3600);
    end if;
  end if;

  if p_global_daily_limit is not null then
    select count(*) into v_count from public.api_usage_events
     where action = p_action and state in ('reserved', 'succeeded', 'failed')
       and created_at >= pg_catalog.date_trunc('day', v_now);
    if v_count >= p_global_daily_limit then
      insert into public.api_usage_events(action, user_id, scope_key_hash, period_key, state, error_category, input_bytes, metadata)
      values (p_action, p_user_id, p_scope_key_hash, p_period_key, 'rejected', 'global_safety_limit', p_input_bytes, coalesce(p_metadata, '{}'::jsonb));
      return pg_catalog.jsonb_build_object('allowed', false, 'code', 'GLOBAL_SAFETY_LIMIT', 'retry_after', 3600);
    end if;
  end if;

  -- Monthly allowance counts what was actually delivered: failed or released
  -- requests stay in the ledger but don't use up the month (SoleTasker 044).
  if p_period_limit is not null and p_period_key is not null then
    select count(*) into v_count from public.api_usage_events
     where action = p_action and user_id = p_user_id and period_key = p_period_key
       and state in ('reserved', 'succeeded');
    if v_count >= p_period_limit then
      insert into public.api_usage_events(action, user_id, scope_key_hash, period_key, state, error_category, input_bytes, metadata)
      values (p_action, p_user_id, p_scope_key_hash, p_period_key, 'rejected', 'allowance_exhausted', p_input_bytes, coalesce(p_metadata, '{}'::jsonb));
      return pg_catalog.jsonb_build_object('allowed', false, 'code', 'ALLOWANCE_EXHAUSTED');
    end if;
  end if;

  insert into public.api_usage_events(action, user_id, scope_key_hash, idempotency_key_hash, period_key, state,
                                      lease_expires_at, input_bytes, metadata)
  values (p_action, p_user_id, p_scope_key_hash, p_idempotency_key_hash, p_period_key, 'reserved',
          v_now + pg_catalog.make_interval(secs => p_lease_seconds), p_input_bytes, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_event_id;

  return pg_catalog.jsonb_build_object('allowed', true, 'event_id', v_event_id);
end;
$$;

create or replace function public.finish_api_action(
  p_event_id uuid, p_state text, p_error_category text, p_provider text, p_provider_request_id text,
  p_input_units bigint, p_output_units bigint, p_estimated_cost_usd numeric, p_duration_ms integer
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('succeeded', 'failed', 'released') then raise exception 'invalid terminal state'; end if;
  update public.api_usage_events
     set state = p_state, error_category = p_error_category, provider = p_provider,
         provider_request_id = p_provider_request_id, input_units = p_input_units,
         output_units = p_output_units, estimated_cost_usd = p_estimated_cost_usd,
         duration_ms = p_duration_ms, lease_expires_at = null, completed_at = pg_catalog.clock_timestamp()
   where id = p_event_id and state = 'reserved';
end;
$$;

create or replace function public.claim_webhook_event(p_provider text, p_provider_event_id text, p_event_type text, p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.provider_webhook_events%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider || ':' || p_provider_event_id, 0));
  select * into v_row from public.provider_webhook_events
   where provider = p_provider and provider_event_id = p_provider_event_id for update;
  if found and v_row.state = 'succeeded' then
    return pg_catalog.jsonb_build_object('claimed', false, 'duplicate', true, 'event_id', v_row.id);
  end if;
  if found and v_row.state = 'processing' and v_row.lease_expires_at > clock_timestamp() then
    return pg_catalog.jsonb_build_object('claimed', false, 'duplicate', false, 'event_id', v_row.id);
  end if;
  if found then
    update public.provider_webhook_events
       set state = 'processing', event_type = p_event_type, error_category = null,
           lease_expires_at = clock_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds)
     where id = v_row.id;
    return pg_catalog.jsonb_build_object('claimed', true, 'event_id', v_row.id);
  end if;
  insert into public.provider_webhook_events(provider, provider_event_id, event_type, state, lease_expires_at)
  values (p_provider, p_provider_event_id, p_event_type, 'processing', clock_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds))
  returning * into v_row;
  return pg_catalog.jsonb_build_object('claimed', true, 'event_id', v_row.id);
end;
$$;

create or replace function public.finish_webhook_event(p_event_id uuid, p_succeeded boolean, p_error_category text)
returns void language sql security definer set search_path = '' as $$
  update public.provider_webhook_events
     set state = case when p_succeeded then 'succeeded' else 'failed' end,
         error_category = p_error_category, lease_expires_at = null,
         processed_at = case when p_succeeded then clock_timestamp() else null end
   where id = p_event_id;
$$;

revoke execute on function public.reserve_api_action(text, uuid, text, text, integer, integer, integer, text, integer, integer, integer, integer, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.finish_api_action(uuid, text, text, text, text, bigint, bigint, numeric, integer) from public, anon, authenticated;
revoke execute on function public.claim_webhook_event(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.finish_webhook_event(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.reserve_api_action(text, uuid, text, text, integer, integer, integer, text, integer, integer, integer, integer, bigint, jsonb) to service_role;
grant execute on function public.finish_api_action(uuid, text, text, text, text, bigint, bigint, numeric, integer) to service_role;
grant execute on function public.claim_webhook_event(text, text, text, integer) to service_role;
grant execute on function public.finish_webhook_event(uuid, boolean, text) to service_role;

commit;
