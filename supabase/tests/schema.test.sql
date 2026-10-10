-- Security tests for 001_watchdog_schema.sql. Run with scripts/db-test.sh on a
-- throwaway local Postgres (supabase-stub.sql + the migrations). Each check
-- raises an exception on failure, so the run stops at the first broken rule.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

-- Helpers (created as the superuser, used while acting as a signed-in user).
create function pg_temp.act_as(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'reset role'; else execute 'set role authenticated'; end if;
end $$;

create function pg_temp.must_fail(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_like then raise exception 'expected error like "%" from: % — got: %', p_like, p_sql, sqlerrm; end if;
    return;
  end;
  raise exception 'expected this to be refused, but it worked: %', p_sql;
end $$;

create function pg_temp.check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAILED: %', p_what; end if;
  raise notice 'ok  %', p_what;
end $$;

-- Two tradies sign up.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'mick@example.com', '{"name":"Mick"}'),
  ('22222222-2222-2222-2222-222222222222', 'jo@example.com', '{}');

select pg_temp.check((select count(*) = 2 from public.profiles), 'signup creates a profile');
select pg_temp.check((select count(*) = 2 from public.account_billing where subscription_status = 'inactive'), 'signup creates a billing row, not paid');
select pg_temp.check((select bool_and(intake_email_token ~ '^[a-f0-9]{32}$') and count(distinct intake_email_token) = 2 from public.profiles), 'each account gets its own random intake token');

-- ---- Mick, signed in ----
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select pg_temp.must_fail($$insert into public.suppliers (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'Reece')$$, '%WATCHDOG_READ_ONLY%');
select pg_temp.check((select has_access from public.get_my_subscription_access()), 'first visit starts the 14-day trial');
select pg_temp.check((select trial_ends_at::date = (now() + interval '14 days')::date from public.account_billing), 'trial is 14 days');

insert into public.suppliers (id, user_id, name, terms) values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Reece', '30 days EOM');
insert into public.bills (id, user_id, supplier_id, ref, total, issued_on, due_on)
  values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'INV-1', 1284.50, current_date, current_date + 30);
select pg_temp.check(true, 'trial user can add a supplier and a bill');

select pg_temp.must_fail($$insert into public.bills (user_id, supplier_id, ref, total, issued_on, due_on) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'inv-1', 10, current_date, current_date)$$, '%bills_user_supplier_ref_idx%');
select pg_temp.must_fail($$insert into public.bills (user_id, total, issued_on, due_on) values ('11111111-1111-1111-1111-111111111111', 10, current_date, current_date - 5)$$, '%check constraint%');
select pg_temp.must_fail($$update public.suppliers set credit_limit = -5$$, '%check constraint%');
update public.suppliers set credit_limit = 10000;
select pg_temp.check((select credit_limit = 10000 from public.suppliers), 'credit limit saves');

-- Giving yourself paid access must not be possible from the browser.
select pg_temp.must_fail($$update public.account_billing set subscription_status = 'active'$$, '%permission denied%');
select pg_temp.must_fail($$update public.account_billing set trial_ends_at = now() + interval '10 years'$$, '%permission denied%');
select pg_temp.must_fail($$insert into public.billing_access_overrides (user_id) values ('11111111-1111-1111-1111-111111111111')$$, '%permission denied%');
select pg_temp.must_fail($$update public.profiles set intake_email_token = 'aaaaaaaaaaaaaaaaaaaaaaaa'$$, '%permission denied%');
update public.profiles set business_name = 'Site Crew Pty Ltd';
select pg_temp.check((select business_name = 'Site Crew Pty Ltd' from public.profiles), 'can still edit own business name');

-- Server-only functions are out of reach.
select pg_temp.must_fail($$select public.reserve_api_action('x', null, 'h', null, 60, 5, 1, null, null, null, null, 30, null, '{}')$$, '%permission denied%');
select pg_temp.must_fail($$select * from public.get_subscription_access_for_user('22222222-2222-2222-2222-222222222222')$$, '%permission denied%');
select pg_temp.must_fail($$select * from public.api_usage_events$$, '%permission denied%');

-- ---- Jo, signed in ----
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.get_my_subscription_access();
select pg_temp.check((select count(*) = 0 from public.bills), 'Jo cannot see Mick''s bills');
select pg_temp.check((select count(*) = 0 from public.suppliers), 'Jo cannot see Mick''s suppliers');
select pg_temp.check((select count(*) = 1 from public.profiles), 'Jo sees only her own profile');
select pg_temp.check((select count(*) = 1 from public.account_billing), 'Jo sees only her own billing');
select pg_temp.must_fail($$insert into public.bills (user_id, supplier_id, total, issued_on, due_on) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 5, current_date, current_date)$$, '%row-level security%');
select pg_temp.must_fail($$insert into public.bill_lines (user_id, bill_id, description) values ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'sneaky')$$, '%row-level security%');
select pg_temp.must_fail($$insert into public.bills (user_id, total, issued_on, due_on) values ('11111111-1111-1111-1111-111111111111', 5, current_date, current_date)$$, '%row-level security%');
update public.bills set total = 0;   -- RLS hides Mick's row, so this touches nothing
select pg_temp.must_fail($$insert into public.bills (user_id, total, issued_on, due_on, photo_path) values ('22222222-2222-2222-2222-222222222222', 5, current_date, current_date, '11111111-1111-1111-1111-111111111111/x.jpg')$$, '%row-level security%');
select pg_temp.must_fail($$insert into storage.objects (bucket_id, name) values ('dockets', '11111111-1111-1111-1111-111111111111/x.jpg')$$, '%row-level security%');
insert into storage.objects (bucket_id, name) values ('dockets', '22222222-2222-2222-2222-222222222222/docket.jpg');
select pg_temp.check(true, 'Jo can upload a docket into her own folder only');

-- ---- Trial runs out ----
select pg_temp.act_as(null);
select pg_temp.check((select total = 1284.50 from public.bills where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'Mick''s bill untouched by Jo');
update public.account_billing set trial_ends_at = now() - interval '1 minute' where user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select not has_access from public.get_my_subscription_access()), 'expired trial has no access');
select pg_temp.check((select count(*) = 1 from public.bills), 'expired trial can still see bills');
select pg_temp.must_fail($$update public.bills set paid_on = current_date$$, '%WATCHDOG_READ_ONLY%');
select pg_temp.must_fail($$insert into storage.objects (bucket_id, name) values ('dockets', '11111111-1111-1111-1111-111111111111/late.jpg')$$, '%row-level security%');

-- Stripe webhook (service role) marks him paid; a paid account can't fall back on trial time later.
select pg_temp.act_as(null);
update public.account_billing set subscription_status = 'active', stripe_subscription_id = 'sub_1' where user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
update public.bills set paid_on = current_date;
select pg_temp.check(true, 'paid account can write again');
select pg_temp.act_as(null);
update public.account_billing set subscription_status = 'canceled', trial_ends_at = now() + interval '5 days' where user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.check((select not has_access from public.get_subscription_access_for_user('11111111-1111-1111-1111-111111111111')), 'cancelled subscriber does not get leftover trial time');
insert into public.billing_access_overrides (user_id, reason) values ('11111111-1111-1111-1111-111111111111', 'founder');
select pg_temp.check((select has_access and subscription_status = 'grandfathered' from public.get_subscription_access_for_user('11111111-1111-1111-1111-111111111111')), 'grandfathered account always has access');

-- ---- Limits (server side) ----
create function pg_temp.reserve(p_period_limit integer) returns jsonb language sql as $$
  select public.reserve_api_action('invoice_read', '22222222-2222-2222-2222-222222222222', 'user:jo', null,
    60, 3, 5, '2026-10', p_period_limit, null, null, 120, null, '{}') $$;
select pg_temp.check((select (pg_temp.reserve(null)->>'allowed')::boolean), 'first request allowed');
select pg_temp.check((select (pg_temp.reserve(null)->>'allowed')::boolean), 'second request allowed');
select pg_temp.check((select (pg_temp.reserve(null)->>'allowed')::boolean), 'third request allowed');
select pg_temp.check((select pg_temp.reserve(null)->>'code' = 'RATE_LIMITED'), 'fourth inside a minute is rate limited');
delete from public.api_usage_events;
select public.finish_api_action((pg_temp.reserve(2)->>'event_id')::uuid, 'failed', 'provider_failure', 'openai', null, null, null, null, null);
select public.finish_api_action((pg_temp.reserve(2)->>'event_id')::uuid, 'succeeded', null, 'openai', null, null, null, null, null);
select pg_temp.check((select (pg_temp.reserve(2)->>'allowed')::boolean), 'a failed read does not use up the monthly allowance');
select pg_temp.check((select pg_temp.reserve(2)->>'code' = 'RATE_LIMITED'), 'burst still counts failed reads');
delete from public.api_usage_events where state = 'failed';
select pg_temp.check((select pg_temp.reserve(2)->>'code' = 'ALLOWANCE_EXHAUSTED'), 'monthly allowance enforced');

select pg_temp.check((select (public.claim_webhook_event('stripe', 'evt_1', 'invoice.paid', 60)->>'claimed')::boolean), 'webhook claimed once');
select pg_temp.check((select not (public.claim_webhook_event('stripe', 'evt_1', 'invoice.paid', 60)->>'claimed')::boolean), 'same webhook not processed twice');

\echo ALL SCHEMA TESTS PASSED
