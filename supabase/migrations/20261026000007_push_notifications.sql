-- Web Push reminders: "stock full" (once per refill cycle) and "your streak
-- ends tonight" (once a day, from 19:00 Paris time). Opt-in per device.
--
-- Flow: pg_cron calls private.dispatch_push() every 10 minutes, which posts
-- to the site's dispatch route (pg_net) when private settings
-- push_dispatch_url and push_dispatch_secret exist. The route (service role)
-- takes the due notifications with take_due_notifications() and sends them
-- with the VAPID keys. Without those settings nothing is sent.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  notify_stock_full boolean not null default true,
  notify_streak boolean not null default true,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
-- No client privilege: the keys are only read by the dispatch route.

alter table public.booster_state add column stock_full_notified_at timestamptz;
alter table public.login_streaks add column reminded_on date;

create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_stock_full boolean default true, p_streak boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'invalid_subscription' using errcode = 'P0001';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = uid and endpoint <> p_endpoint) >= 10 then
    raise exception 'too_many_devices' using errcode = 'P0001';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, notify_stock_full, notify_streak)
  values (uid, p_endpoint, p_p256dh, p_auth, coalesce(p_stock_full, true), coalesce(p_streak, true))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    notify_stock_full = excluded.notify_stock_full, notify_streak = excluded.notify_streak;
end;
$$;

create function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create function public.get_push_subscription(p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('stock_full', notify_stock_full, 'streak', notify_streak)
  from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Due notifications, marked as sent in the same transaction. Service role only.
create function public.take_due_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg jsonb := private.config('booster');
  max_stock integer := (cfg ->> 'max_stock')::integer;
  step interval := make_interval(mins => (cfg ->> 'refill_minutes')::integer);
  now_ts timestamptz := now();
  today date := private.paris_today(now());
  evening boolean := extract(hour from (now() at time zone 'Europe/Paris')) >= 19;
  result jsonb;
begin
  with stock_full as (
    select bs.user_id,
           case when bs.stock >= max_stock then bs.last_refill_at
                else bs.last_refill_at + (max_stock - bs.stock) * step end as full_at
    from public.booster_state bs
    join auth.users u on u.id = bs.user_id and not coalesce(u.is_anonymous, false)
    where exists (select 1 from public.push_subscriptions s where s.user_id = bs.user_id and s.notify_stock_full)
  ),
  due_stock as (
    update public.booster_state bs set stock_full_notified_at = now_ts
    from stock_full f
    where bs.user_id = f.user_id and f.full_at <= now_ts
      and (bs.stock_full_notified_at is null or bs.stock_full_notified_at < f.full_at)
    returning bs.user_id
  ),
  due_streak as (
    update public.login_streaks ls set reminded_on = today
    where evening and ls.last_claim_on = today - 1 and ls.reminded_on is distinct from today
      and exists (select 1 from public.push_subscriptions s where s.user_id = ls.user_id and s.notify_streak)
    returning ls.user_id, ls.day_index
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
           'kind', d.kind, 'locale', pr.locale, 'day', d.day)), '[]'::jsonb)
  into result
  from (
    select user_id, 'stock_full' as kind, null::integer as day from due_stock
    union all
    select user_id, 'streak', day_index % 7 + 1 from due_streak
  ) d
  join public.push_subscriptions s on s.user_id = d.user_id
    and ((d.kind = 'stock_full' and s.notify_stock_full) or (d.kind = 'streak' and s.notify_streak))
  join public.profiles pr on pr.id = d.user_id;
  return result;
end;
$$;

-- Expired endpoint reported by the push service (404/410). Service role only.
create function public.remove_push_endpoint(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- Asks the site to send the due notifications (needs pg_net and the private
-- settings push_dispatch_url / push_dispatch_secret; silently skipped otherwise).
create function private.dispatch_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select value #>> '{}' from private.settings where key = 'push_dispatch_url');
  secret text := (select value #>> '{}' from private.settings where key = 'push_dispatch_secret');
begin
  if url is null or secret is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := ''{}''::jsonb)'
    using url, jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json');
end;
$$;

revoke execute on function private.dispatch_push() from public, anon, authenticated;
revoke execute on function
  public.save_push_subscription(text, text, text, boolean, boolean), public.delete_push_subscription(text),
  public.get_push_subscription(text), public.take_due_notifications(), public.remove_push_endpoint(text)
from public, anon, authenticated;
grant execute on function
  public.save_push_subscription(text, text, text, boolean, boolean), public.delete_push_subscription(text),
  public.get_push_subscription(text)
to authenticated;
grant execute on function public.take_due_notifications(), public.remove_push_endpoint(text) to service_role;

-- Every 10 minutes when pg_cron is available (Supabase).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from pg_available_extensions where name = 'pg_net') then
      create extension if not exists pg_net;
    end if;
    perform cron.schedule('deuce-push-dispatch', '*/10 * * * *', 'select private.dispatch_push()');
  end if;
end;
$$;
