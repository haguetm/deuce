-- Retention loop and albums:
--   * 7-day login streak with one tolerated missed day per week;
--   * welcome quests (rewarded tutorial), daily quests, achievements;
--   * nation albums and hand-picked collections.
--
-- Progress is never stored: it is recomputed from the game tables
-- (openings, collection, recycling, wishlist, profile), so it cannot drift
-- or be forged. Only claims are stored, one row per quest and period, and
-- each credit carries a unique ledger idempotency key.

-- 1. Tables -----------------------------------------------------------------

alter table public.profiles
  add column showcase bigint[] not null default '{}'
    check (cardinality(showcase) <= 10);                     -- profile showcase (card ids, owned)

create table public.login_streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day_index smallint not null check (day_index between 1 and 7), -- last claimed day of the cycle
  last_claim_on date not null,                                  -- Paris date
  grace_week date,                                              -- Paris week (monday) of grace_used
  grace_used smallint not null default 0 check (grace_used >= 0),
  total_claims integer not null default 0
);

create table public.quest_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('welcome', 'daily', 'achievement', 'bonus')),
  quest_key text not null check (quest_key ~ '^[A-Za-z0-9_]+$'),
  period text not null,                    -- 'once' or the Paris date of a daily quest
  reward integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (user_id, kind, quest_key, period)
);

alter table public.login_streaks enable row level security;
alter table public.quest_claims enable row level security;
grant select on public.login_streaks, public.quest_claims to authenticated;
create policy "own streak" on public.login_streaks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own quest claims" on public.quest_claims
  for select to authenticated using (user_id = (select auth.uid()));

-- 2. Collections and albums -------------------------------------------------

-- Members of a hand-picked collection (game_config.collections). Membership
-- is public; the statistic behind it is not returned.
create function private.collection_members(p_key text)
returns setof bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  def jsonb;
begin
  select c into def from jsonb_array_elements(private.config('collections')) c where c ->> 'key' = p_key;
  if def is null then
    return;
  end if;
  if def ? 'slugs' then
    return query
      select p.id from public.players p
      where p.in_catalog and p.slug in (select jsonb_array_elements_text(def -> 'slugs'));
  else
    return query
      select p.id from public.players p
      join public.player_stats s on s.player_id = p.id and s.key = def -> 'stat' ->> 'key'
      where p.in_catalog
        and (def -> 'stat' ->> 'min' is null or s.value_num >= (def -> 'stat' ->> 'min')::numeric)
        and (def -> 'stat' ->> 'max' is null or s.value_num <= (def -> 'stat' ->> 'max')::numeric);
  end if;
end;
$$;

-- Nation albums: countries with at least this many catalogue cards.
create function private.album_min_size()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 5;
$$;

-- The caller's albums: one per nation (with per-rarity counts) and one per
-- hand-picked collection. Public catalogue data plus the caller's own cards.
create function public.get_albums()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'nations', coalesce((
      with cards as (
        select p.country_code, p.rarity_effective as rarity, uc.player_id is not null as owned
        from public.players p
        left join public.user_cards uc on uc.player_id = p.id and uc.user_id = uid
        where p.in_catalog and p.country_code is not null
      ),
      by_rarity as (
        select country_code, rarity, count(*)::integer as total, count(*) filter (where owned)::integer as owned
        from cards group by country_code, rarity
      ),
      nations as (
        select country_code, sum(total)::integer as total, sum(owned)::integer as owned,
               jsonb_object_agg(rarity, jsonb_build_array(owned, total)) as by_rarity
        from by_rarity group by country_code
        having sum(total) >= private.album_min_size()
      )
      select jsonb_agg(jsonb_build_object(
               'country', country_code, 'total', total, 'owned', owned, 'by_rarity', by_rarity)
             order by owned::numeric / total desc, total desc, country_code)
      from nations
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object('key', c ->> 'key', 'total', m.total, 'owned', m.owned,
                                          'players', m.players))
      from jsonb_array_elements(private.config('collections')) c
      cross join lateral (
        select count(*)::integer as total, count(uc.player_id)::integer as owned,
               coalesce(jsonb_agg(ids.id order by ids.id), '[]'::jsonb) as players
        from private.collection_members(c ->> 'key') ids(id)
        left join public.user_cards uc on uc.player_id = ids.id and uc.user_id = uid
      ) m
      where m.total > 0
    ), '[]'::jsonb)
  );
end;
$$;

-- 3. Metrics ------------------------------------------------------------------

-- Progress of one metric for a user, counted from p_from (null = all time).
create function private.metric(
  p_uid uuid, p_metric text, p_from timestamptz, p_collection text default null
)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v integer;
begin
  case p_metric
    when 'boosters_opened' then
      select count(*) into v from public.booster_openings
      where user_id = p_uid and (p_from is null or opened_at >= p_from);
    when 'rare_or_better', 'left_handed', 'new_cards' then
      select count(*) into v
      from public.booster_opening_cards c
      join public.booster_openings o on o.id = c.opening_id
      join public.players p on p.id = c.player_id
      where o.user_id = p_uid and (p_from is null or o.opened_at >= p_from)
        and case p_metric
              when 'rare_or_better' then c.rarity >= 'rare'
              when 'left_handed' then p.hand = 'left'
              else c.was_new end;
    when 'daily_booster' then
      select count(*) into v from public.booster_openings
      where user_id = p_uid and source = 'daily' and (p_from is null or opened_at >= p_from);
    when 'recycled' then
      select coalesce(sum(copies), 0) into v from public.recycle_events
      where user_id = p_uid and (p_from is null or at >= p_from);
    when 'wishlist' then
      select (select count(*) from public.wishlist where user_id = p_uid)
           + (select count(*) from public.booster_opening_cards c
              join public.booster_openings o on o.id = c.opening_id
              where o.user_id = p_uid and c.was_wished)
      into v;
    when 'username' then
      select (username is not null)::integer into v from public.profiles where id = p_uid;
    when 'showcase' then
      select (cardinality(showcase) > 0)::integer into v from public.profiles where id = p_uid;
    when 'distinct_cards' then
      select count(*) into v from public.user_cards where user_id = p_uid;
    when 'has_rarity_legendary', 'has_rarity_mythic' then
      select exists (
        select 1 from public.user_cards uc join public.players p on p.id = uc.player_id
        where uc.user_id = p_uid
          and p.rarity_effective >= case when p_metric = 'has_rarity_mythic' then 'mythic'::public.rarity_tier
                                         else 'legendary'::public.rarity_tier end)::integer
      into v;
    when 'collection_complete' then
      select (count(*) > 0 and count(*) = count(uc.player_id))::integer into v
      from private.collection_members(p_collection) m(id)
      left join public.user_cards uc on uc.player_id = m.id and uc.user_id = p_uid;
    when 'career_slam' then
      select (count(distinct s.key) = 4)::integer into v
      from public.user_cards uc
      join public.player_stats s on s.player_id = uc.player_id
      where uc.user_id = p_uid and s.value_num >= 1
        and s.key in ('australian_open_titles', 'roland_garros_titles', 'wimbledon_titles', 'us_open_titles');
    when 'albums_complete' then
      select count(*) into v from (
        select p.country_code
        from public.players p
        left join public.user_cards uc on uc.player_id = p.id and uc.user_id = p_uid
        where p.in_catalog and p.country_code is not null
        group by p.country_code
        having count(*) >= private.album_min_size() and count(*) = count(uc.player_id)
      ) a;
    else
      raise exception 'unknown metric %', p_metric;
  end case;
  return coalesce(v, 0);
end;
$$;

-- Daily quests of a Paris day: the same draw for everyone.
create function private.daily_quests(p_day date)
returns setof jsonb
language sql
stable
set search_path = ''
as $$
  select q from jsonb_array_elements(private.config('daily_quests') -> 'pool') q
  order by md5((q ->> 'key') || ':' || p_day::text)
  limit (private.config('daily_quests') ->> 'per_day')::integer;
$$;

-- Every quest of the caller with its progress and claim status.
create function private.quest_rows(p_uid uuid, p_now timestamptz)
returns table (kind text, quest_key text, period text, metric text, target integer, reward integer,
               progress integer, claimed boolean)
language sql
stable
set search_path = ''
as $$
  with today as (
    select private.paris_today(p_now) as d,
           (private.paris_today(p_now)::timestamp at time zone 'Europe/Paris') as since
  ),
  defs as (
    select 'welcome' as kind, q, 'once' as period, null::timestamptz as since
    from jsonb_array_elements(private.config('welcome_quests') -> 'quests') q
    union all
    select 'daily', q, (select d::text from today), (select since from today)
    from private.daily_quests((select d from today)) q
    union all
    select 'achievement', q, 'once', null
    from jsonb_array_elements(private.config('achievements')) q
  )
  select d.kind, d.q ->> 'key', d.period, d.q ->> 'metric', (d.q ->> 'target')::integer,
         (d.q ->> 'reward')::integer,
         private.metric(p_uid, d.q ->> 'metric', d.since, d.q ->> 'collection'),
         exists (select 1 from public.quest_claims c
                 where c.user_id = p_uid and c.kind = d.kind and c.quest_key = d.q ->> 'key'
                   and c.period = d.period)
  from defs d;
$$;

-- 4. Read API -----------------------------------------------------------------

create function public.get_quests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  now_ts timestamptz := now();
  today date := private.paris_today(now());
  streak public.login_streaks;
  cfg jsonb := private.config('login_streak');
  next_day integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  select * into streak from public.login_streaks where user_id = uid;
  next_day := private.next_streak_day(streak, today);
  return jsonb_build_object(
    'streak', jsonb_build_object(
      'day', coalesce(streak.day_index, 0),
      'claimed_today', coalesce(streak.last_claim_on = today, false),
      'next_day', next_day,
      'rewards', cfg -> 'rewards',
      'last_day_boosters', cfg -> 'last_day_boosters',
      'grace_left', greatest(0, (cfg ->> 'grace_per_week')::integer
                                - case when streak.grace_week = today - (extract(isodow from today)::integer - 1)
                                       then streak.grace_used else 0 end),
      'total', coalesce(streak.total_claims, 0)),
    'quests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', kind, 'key', quest_key, 'target', target, 'reward', reward,
               'progress', least(progress, target), 'claimed', claimed))
      from private.quest_rows(uid, now_ts)), '[]'::jsonb),
    'bonus', jsonb_build_object(
      'daily_boosters', private.config('daily_quests') -> 'all_claimed_boosters',
      'daily_claimed', exists (select 1 from public.quest_claims where user_id = uid and kind = 'bonus'
                                 and quest_key = 'dailyAll' and period = today::text),
      'welcome_boosters', private.config('welcome_quests') -> 'all_claimed_boosters',
      'welcome_claimed', exists (select 1 from public.quest_claims where user_id = uid and kind = 'bonus'
                                   and quest_key = 'welcomeAll' and period = 'once')),
    'resets_at', ((today + 1)::timestamp at time zone 'Europe/Paris'),
    'claimable', (select count(*) from private.quest_rows(uid, now_ts) where not claimed and progress >= target)
                 + case when streak.last_claim_on is distinct from today then 1 else 0 end
  );
end;
$$;

-- 5. Claims -----------------------------------------------------------------

-- Day of the cycle the next claim would give (1 to 7), honoring the grace day.
create function private.next_streak_day(p_streak public.login_streaks, p_today date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  cfg jsonb := private.config('login_streak');
  week date := p_today - (extract(isodow from p_today)::integer - 1);
  gap integer;
  grace_used integer;
begin
  if p_streak.user_id is null then
    return 1;
  end if;
  gap := p_today - p_streak.last_claim_on;
  grace_used := case when p_streak.grace_week = week then p_streak.grace_used else 0 end;
  if gap <= 0 then
    return p_streak.day_index;
  elsif gap = 1 or (gap = 2 and grace_used < (cfg ->> 'grace_per_week')::integer) then
    return p_streak.day_index % 7 + 1;
  end if;
  return 1;
end;
$$;

-- Claims today's login reward (once per Paris day).
create function public.claim_login_streak()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := private.paris_today(now());
  week date := private.paris_today(now()) - (extract(isodow from private.paris_today(now()))::integer - 1);
  cfg jsonb := private.config('login_streak');
  streak public.login_streaks;
  day integer;
  reward integer;
  boosters integer := 0;
  grace boolean;
  claims integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.check_trial(uid, 'bonus');
  select * into streak from public.login_streaks where user_id = uid for update;
  if streak.last_claim_on = today then
    raise exception 'already_claimed' using errcode = 'P0001';
  end if;
  day := private.next_streak_day(streak, today);
  grace := streak.user_id is not null and today - streak.last_claim_on = 2 and day <> 1;
  reward := (cfg -> 'rewards' ->> (day - 1))::integer;

  insert into public.login_streaks (user_id, day_index, last_claim_on, grace_week, grace_used, total_claims)
  values (uid, day, today, case when grace then week end, case when grace then 1 else 0 end, 1)
  on conflict (user_id) do update set
    day_index = excluded.day_index,
    last_claim_on = excluded.last_claim_on,
    grace_week = case when grace then week else public.login_streaks.grace_week end,
    grace_used = case when grace then
                   case when public.login_streaks.grace_week = week then public.login_streaks.grace_used + 1 else 1 end
                 else public.login_streaks.grace_used end,
    total_claims = public.login_streaks.total_claims + 1
  returning total_claims into claims;

  insert into public.ledger (user_id, amount, reason, ref, idempotency_key)
  values (uid, reward, 'login_streak', today::text, 'streak:' || uid || ':' || claims);

  if day = 7 then
    boosters := (cfg ->> 'last_day_boosters')::integer;
    update public.booster_state set bonus_stock = bonus_stock + boosters where user_id = uid;
  end if;

  return jsonb_build_object('day', day, 'aces', reward, 'boosters', boosters, 'grace_used', grace);
end;
$$;

-- Claims every completed quest not yet claimed (or only p_kind/p_key).
-- Returns the aces and bonus boosters earned.
create function public.claim_quests(p_kind text default null, p_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  now_ts timestamptz := now();
  today date := private.paris_today(now());
  q record;
  aces integer := 0;
  boosters integer := 0;
  claimed integer := 0;
  extra integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.check_trial(uid, 'bonus');
  -- Serialize claims of this user (same lock as the openings).
  perform 1 from public.booster_state where user_id = uid for update;

  for q in
    select * from private.quest_rows(uid, now_ts) r
    where not r.claimed and r.progress >= r.target
      and (p_kind is null or r.kind = p_kind) and (p_key is null or r.quest_key = p_key)
  loop
    insert into public.quest_claims (user_id, kind, quest_key, period, reward)
    values (uid, q.kind, q.quest_key, q.period, q.reward);
    if q.reward > 0 then
      insert into public.ledger (user_id, amount, reason, ref, idempotency_key)
      values (uid, q.reward, case when q.kind = 'achievement' then 'achievement' else 'quest' end::public.ledger_reason,
              q.kind || ':' || q.quest_key, 'quest:' || uid || ':' || q.kind || ':' || q.quest_key || ':' || q.period);
    end if;
    aces := aces + q.reward;
    claimed := claimed + 1;
  end loop;

  -- Bonus boosters once every daily (or welcome) quest is claimed.
  if not exists (select 1 from private.quest_rows(uid, now_ts) r where r.kind = 'daily' and not r.claimed)
     and not exists (select 1 from public.quest_claims where user_id = uid and kind = 'bonus'
                       and quest_key = 'dailyAll' and period = today::text) then
    extra := (private.config('daily_quests') ->> 'all_claimed_boosters')::integer;
    insert into public.quest_claims (user_id, kind, quest_key, period) values (uid, 'bonus', 'dailyAll', today::text);
    boosters := boosters + extra;
  end if;
  if not exists (select 1 from private.quest_rows(uid, now_ts) r where r.kind = 'welcome' and not r.claimed)
     and not exists (select 1 from public.quest_claims where user_id = uid and kind = 'bonus'
                       and quest_key = 'welcomeAll' and period = 'once') then
    extra := (private.config('welcome_quests') ->> 'all_claimed_boosters')::integer;
    insert into public.quest_claims (user_id, kind, quest_key, period) values (uid, 'bonus', 'welcomeAll', 'once');
    boosters := boosters + extra;
  end if;
  if boosters > 0 then
    update public.booster_state set bonus_stock = bonus_stock + boosters where user_id = uid;
  end if;

  if claimed = 0 and boosters = 0 then
    raise exception 'nothing_to_claim' using errcode = 'P0001';
  end if;
  return jsonb_build_object('claimed', claimed, 'aces', aces, 'boosters', boosters);
end;
$$;

-- 6. Privileges -------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.get_albums(), public.get_quests(), public.claim_login_streak(), public.claim_quests(text, text)
from public, anon;
grant execute on function
  public.get_albums(), public.get_quests(), public.claim_login_streak(), public.claim_quests(text, text)
to authenticated;
