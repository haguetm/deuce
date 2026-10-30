-- Booster progression:
--   * golden booster: random (game_config.golden_booster.chance_bp) with a
--     guarantee after pity_at - 1 boosters without one; its last slot draws
--     from a better table;
--   * top-rarity guarantee: the pity_at-th booster in a row without a mythic
--     card gets one in its last slot (natural odds are unchanged otherwise);
--   * card pools (choice of free booster) and a free daily themed booster;
--   * shop formats bought with aces (box, qualifiers);
--   * wishlist, catalogue numbers, bulk recycling of duplicates.
--
-- Safety: every draw still happens inside open_booster() (SECURITY DEFINER,
-- caller's booster_state row locked). The golden and pity decisions are
-- derived from the opening seed and the stored counters, so an opening stays
-- replayable for audit. A pool only restricts which players can be drawn:
-- rarity odds never depend on it (empty pool tier -> whole catalogue tier).

-- 1. State ------------------------------------------------------------------

alter table public.booster_state
  add column golden_counter integer not null default 0 check (golden_counter >= 0),  -- boosters since the last golden one
  add column mythic_counter integer not null default 0 check (mythic_counter >= 0),  -- boosters since the last mythic card
  add column daily_claimed_on date,                                                   -- Paris date of the last daily booster
  add column box_week date,                                                           -- Paris week (monday) of the box purchases
  add column box_count smallint not null default 0 check (box_count >= 0),
  add column qualifiers_day date,
  add column qualifiers_count smallint not null default 0 check (qualifiers_count >= 0);

alter table public.booster_openings
  add column golden boolean not null default false,
  add column mythic_pity boolean not null default false,   -- last slot forced to mythic by the guarantee
  add column pool text,                                     -- chosen pool (free/bonus/aces) or daily theme key
  add column card_count smallint;
-- The seed stays unreadable (column grants, see 20261016000005_hide_draw_seed.sql).
grant select (golden, mythic_pity, pool, card_count) on public.booster_openings to authenticated;

-- The box holds 20 cards.
alter table public.booster_opening_cards drop constraint booster_opening_cards_slot_check;
alter table public.booster_opening_cards add constraint booster_opening_cards_slot_check check (slot between 1 and 20);
alter table public.booster_opening_cards add column was_wished boolean not null default false;

-- 2. Wishlist ---------------------------------------------------------------

create table public.wishlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  player_id bigint not null references public.players (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, player_id)
);
alter table public.wishlist enable row level security;
grant select on public.wishlist to authenticated;
create policy "own wishlist" on public.wishlist
  for select to authenticated using (user_id = (select auth.uid()));

-- Adds or removes a card from the caller's wishlist (owned cards cannot be wished).
create function public.set_wishlist(p_player_id bigint, p_wished boolean)
returns boolean
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
  if not p_wished then
    delete from public.wishlist where user_id = uid and player_id = p_player_id;
    return false;
  end if;
  if not exists (select 1 from public.players where id = p_player_id and in_catalog) then
    raise exception 'unknown_card' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_cards where user_id = uid and player_id = p_player_id) then
    raise exception 'already_owned' using errcode = 'P0001';
  end if;
  if (select count(*) from public.wishlist where user_id = uid) >= 50 then
    raise exception 'wishlist_full' using errcode = 'P0001';
  end if;
  insert into public.wishlist (user_id, player_id) values (uid, p_player_id) on conflict do nothing;
  return true;
end;
$$;

-- 3. Catalogue numbers --------------------------------------------------------

-- Stable while the catalogue only grows: number = rank by id among catalogue cards.
create function public.catalog_number(p_player_id bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.players where in_catalog and id <= p_player_id;
$$;

create function public.catalog_size()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.players where in_catalog;
$$;

-- 4. Draw helpers -------------------------------------------------------------

create function private.paris_today(p_now timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_now at time zone 'Europe/Paris')::date;
$$;

-- Rarity between p_min and p_max (rates renormalized over the allowed tiers).
create function private.draw_rarity_range(
  p_u double precision, p_min public.rarity_tier, p_max public.rarity_tier
)
returns public.rarity_tier
language plpgsql
stable
set search_path = ''
as $$
declare
  rates jsonb := private.config('drop_rates');
  tier public.rarity_tier;
  last public.rarity_tier;
  total numeric := 0;
  acc numeric := 0;
begin
  foreach tier in array enum_range(null::public.rarity_tier) loop
    if tier between p_min and p_max then
      total := total + (rates ->> tier::text)::numeric;
    end if;
  end loop;
  if total <= 0 then
    raise exception 'drop rates are empty from % to %', p_min, p_max;
  end if;
  foreach tier in array enum_range(null::public.rarity_tier) loop
    if tier between p_min and p_max then
      last := tier;
      acc := acc + (rates ->> tier::text)::numeric;
      if p_u * total < acc then
        return tier;
      end if;
    end if;
  end loop;
  return last; -- floating-point edge: highest allowed tier
end;
$$;

-- Does a player match a pool filter (see CardPool in config/game.ts)?
create function private.in_pool(p public.players, p_pool jsonb, p_today date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_pool ->> 'sex' is null or p.sex::text = p_pool ->> 'sex')
     and (p_pool ->> 'hand' is null or p.hand::text = p_pool ->> 'hand')
     and (p_pool ->> 'country' is null or p.country_code = p_pool ->> 'country')
     and (p_pool ->> 'surface' is null or p.preferred_surface::text = p_pool ->> 'surface')
     and (p_pool ->> 'career_end_before' is null
          or (p.career_end_year is not null and p.career_end_year < (p_pool ->> 'career_end_before')::integer))
     and (not coalesce((p_pool ->> 'birthday')::boolean, false)
          or (p.birth_date is not null
              and extract(month from p.birth_date) = extract(month from p_today)
              and extract(day from p.birth_date) = extract(day from p_today)))
     and (p_pool ->> 'born_from' is null
          or (p.birth_date is not null and extract(year from p.birth_date) >= (p_pool ->> 'born_from')::integer))
     and (p_pool ->> 'born_to' is null
          or (p.birth_date is not null and extract(year from p.birth_date) <= (p_pool ->> 'born_to')::integer));
$$;

-- Uniform pick among the pool's cards of a tier; whole tier when the pool has none.
create function private.pick_player_in_pool(
  p_rarity public.rarity_tier, p_u double precision, p_pool jsonb, p_today date
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  n integer;
  pid bigint;
begin
  if p_pool is null or p_pool = '{}'::jsonb then
    return private.pick_player(p_rarity, p_u);
  end if;
  select count(*) into n from public.players p
  where p.in_catalog and p.rarity_effective = p_rarity and private.in_pool(p, p_pool, p_today);
  if n = 0 then
    return private.pick_player(p_rarity, p_u);
  end if;
  select p.id into pid from public.players p
  where p.in_catalog and p.rarity_effective = p_rarity and private.in_pool(p, p_pool, p_today)
  order by p.id
  offset least(floor(p_u * n)::integer, n - 1) limit 1;
  return pid;
end;
$$;

-- Theme of the daily booster: active calendar theme, else the day's rotation.
create function private.daily_theme(p_today date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  themes jsonb := private.config('daily_themes');
  md text := to_char(p_today, 'MM-DD');
  theme jsonb;
  n integer := jsonb_array_length(themes -> 'rotation');
begin
  select t into theme from jsonb_array_elements(themes -> 'calendar') t
  where md between t ->> 'from' and t ->> 'to'
  limit 1;
  if theme is not null then
    return jsonb_build_object('key', theme ->> 'key', 'pool', theme -> 'pool');
  end if;
  theme := themes -> 'rotation' -> ((p_today - date '2026-01-01') % n + n) % n;
  return jsonb_build_object('key', theme ->> 'key', 'pool', theme -> 'pool');
end;
$$;

-- Draws the cards of an opening. Slot p_cards uses p_last_min (or exactly
-- p_force_last); every slot is capped at p_max. Updates the collection and
-- empties matching wishlist entries.
create function private.draw_cards(
  p_uid uuid, p_opening uuid, p_seed bytea, p_now timestamptz, p_cards integer,
  p_last_min public.rarity_tier, p_max public.rarity_tier, p_pool jsonb,
  p_force_last public.rarity_tier
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  today date := private.paris_today(p_now);
  slot integer;
  tier public.rarity_tier;
  pid bigint;
  is_new boolean;
  wished boolean;
begin
  for slot in 1..p_cards loop
    if slot = p_cards and p_force_last is not null then
      tier := p_force_last;
    else
      tier := private.draw_rarity_range(
        private.rand_unit(p_seed, 'rarity:' || slot),
        case when slot = p_cards then p_last_min else 'common'::public.rarity_tier end,
        p_max);
    end if;
    pid := private.pick_player_in_pool(tier, private.rand_unit(p_seed, 'card:' || slot), p_pool, today);

    is_new := not exists (select 1 from public.user_cards where user_id = p_uid and player_id = pid);
    delete from public.wishlist where user_id = p_uid and player_id = pid;
    wished := found;
    insert into public.user_cards (user_id, player_id, quantity, first_obtained_at, last_obtained_at)
    values (p_uid, pid, 1, p_now, p_now)
    on conflict (user_id, player_id) do update
      set quantity = public.user_cards.quantity + 1, last_obtained_at = p_now;

    insert into public.booster_opening_cards (opening_id, slot, player_id, rarity, was_new, was_wished)
    values (p_opening, slot, pid, tier, is_new, wished);
  end loop;
end;
$$;

-- 5. JSON views -------------------------------------------------------------

create or replace function private.opening_json(p_opening uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'opening_id', o.id,
    'opened_at', o.opened_at,
    'source', o.source,
    'golden', o.golden,
    'mythic_pity', o.mythic_pity,
    'pool', o.pool,
    'catalog_size', public.catalog_size(),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slot', c.slot, 'player_id', c.player_id, 'slug', p.slug, 'name', p.name,
               'country_code', p.country_code, 'rarity', c.rarity, 'was_new', c.was_new,
               'was_wished', c.was_wished, 'catalog_number', public.catalog_number(p.id),
               'image', (select jsonb_build_object(
                           'path', i.storage_path, 'width', i.width, 'height', i.height,
                           'author', i.author, 'license', i.license,
                           'license_url', i.license_url, 'source_url', i.source_url)
                         from public.player_images i
                         where i.player_id = p.id and i.is_primary and not i.hidden))
             order by c.slot)
      from public.booster_opening_cards c
      join public.players p on p.id = c.player_id
      where c.opening_id = o.id), '[]'::jsonb)
  )
  from public.booster_openings o
  where o.id = p_opening;
$$;

create or replace function private.booster_state_json(p_user uuid, p_now timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  st public.booster_state;
  fresh record;
  cfg jsonb := private.config('booster');
  aces jsonb := private.config('aces_booster');
  shop jsonb := private.config('shop');
  golden jsonb := private.config('golden_booster');
  mythic jsonb := private.config('mythic_pity');
  today date := private.paris_today(p_now);
  week date := today - (extract(isodow from today)::integer - 1);
  purchases integer;
  balance bigint;
begin
  select * into st from public.booster_state where user_id = p_user;
  if not found then
    raise exception 'no booster state for user' using errcode = 'no_data_found';
  end if;
  select * into fresh from private.refreshed_stock(st.stock, st.last_refill_at, p_now);
  purchases := case when st.aces_purchases_day = (p_now at time zone 'utc')::date then st.aces_purchases_count else 0 end;
  select coalesce(sum(amount), 0) into balance from public.ledger where user_id = p_user;
  return jsonb_build_object(
    'stock', fresh.stock,
    'max_stock', (cfg ->> 'max_stock')::integer,
    'next_refill_at', case when fresh.stock >= (cfg ->> 'max_stock')::integer then null
                           else fresh.last_refill_at + make_interval(mins => (cfg ->> 'refill_minutes')::integer) end,
    'bonus_stock', st.bonus_stock,
    'aces_purchases_left', greatest(0, (aces ->> 'daily_cap')::integer - purchases),
    'aces', balance,
    'golden_in', greatest(1, (golden ->> 'pity_at')::integer - st.golden_counter),
    'mythic_in', greatest(1, (mythic ->> 'pity_at')::integer - st.mythic_counter),
    'daily_available', st.daily_claimed_on is distinct from today,
    'daily_theme', private.daily_theme(today) ->> 'key',
    'box_left', greatest(0, (shop -> 'box' ->> 'weekly_cap')::integer
                           - case when st.box_week = week then st.box_count else 0 end),
    'qualifiers_left', greatest(0, (shop -> 'qualifiers' ->> 'daily_cap')::integer
                           - case when st.qualifiers_day = today then st.qualifiers_count else 0 end)
  );
end;
$$;

-- 6. Opening ------------------------------------------------------------------

drop function public.open_booster(public.booster_source, text);

-- Opens one booster for the caller. Sources:
--   free / bonus / aces : standard booster from a chosen pool (p_pool);
--   daily               : once per Paris day, themed, better last slot;
--   box / qualifiers    : shop formats paid in aces.
-- Errors use stable messages that the UI maps to translations.
create function public.open_booster(
  p_source public.booster_source, p_request_id text, p_pool text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  now_ts timestamptz := now();
  utc_today date := (now() at time zone 'utc')::date;
  today date := private.paris_today(now());
  week date := private.paris_today(now()) - (extract(isodow from private.paris_today(now()))::integer - 1);
  st public.booster_state;
  fresh record;
  booster_cfg jsonb := private.config('booster');
  aces_cfg jsonb := private.config('aces_booster');
  shop jsonb := private.config('shop');
  golden_cfg jsonb := private.config('golden_booster');
  mythic_cfg jsonb := private.config('mythic_pity');
  cards integer := (booster_cfg ->> 'cards_per_booster')::integer;
  last_min public.rarity_tier := (booster_cfg ->> 'guaranteed_slot_min_rarity')::public.rarity_tier;
  max_tier public.rarity_tier := 'mythic';
  standard boolean := p_source in ('free', 'bonus', 'aces', 'daily');
  pool jsonb := '{}'::jsonb;
  pool_key text := null;
  price integer := 0;
  purchases integer;
  balance bigint;
  existing uuid;
  opening uuid := gen_random_uuid();
  seed bytea := extensions.gen_random_bytes(32);
  is_golden boolean := false;
  force_mythic boolean := false;
  theme jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_request_id is null or length(p_request_id) not between 8 and 100 then
    raise exception 'invalid_request_id' using errcode = 'invalid_parameter_value';
  end if;

  -- Serialize all openings of this user.
  select * into st from public.booster_state where user_id = uid for update;
  if not found then
    raise exception 'no booster state for user' using errcode = 'no_data_found';
  end if;

  -- Idempotent replay (checked under the lock).
  select id into existing from public.booster_openings where user_id = uid and request_id = p_request_id;
  if found then
    return private.opening_json(existing) || jsonb_build_object('state', private.booster_state_json(uid, now_ts), 'replayed', true);
  end if;

  perform private.check_trial(uid, p_source);

  select * into fresh from private.refreshed_stock(st.stock, st.last_refill_at, now_ts);
  st.stock := fresh.stock;
  st.last_refill_at := fresh.last_refill_at;

  if p_source in ('free', 'bonus', 'aces') then
    pool_key := coalesce(p_pool, 'all');
    pool := private.config('pools') -> pool_key;
    if pool is null then
      raise exception 'invalid_pool' using errcode = 'P0001';
    end if;
  end if;

  case p_source
    when 'free' then
      if st.stock < 1 then
        raise exception 'no_booster_available' using errcode = 'P0001';
      end if;
      st.stock := st.stock - 1;
    when 'bonus' then
      if st.bonus_stock < 1 then
        raise exception 'no_booster_available' using errcode = 'P0001';
      end if;
      st.bonus_stock := st.bonus_stock - 1;
    when 'aces' then
      purchases := case when st.aces_purchases_day = utc_today then st.aces_purchases_count else 0 end;
      if purchases >= (aces_cfg ->> 'daily_cap')::integer then
        raise exception 'daily_cap_reached' using errcode = 'P0001';
      end if;
      price := (aces_cfg ->> 'price')::integer;
      st.aces_purchases_day := utc_today;
      st.aces_purchases_count := purchases + 1;
    when 'daily' then
      if st.daily_claimed_on = today then
        raise exception 'daily_already_claimed' using errcode = 'P0001';
      end if;
      st.daily_claimed_on := today;
      theme := private.daily_theme(today);
      pool := theme -> 'pool';
      pool_key := theme ->> 'key';
      cards := (private.config('daily_booster') ->> 'cards')::integer;
      last_min := greatest(last_min, (private.config('daily_booster') ->> 'guaranteed_slot_min_rarity')::public.rarity_tier);
    when 'box' then
      if st.box_week = week and st.box_count >= (shop -> 'box' ->> 'weekly_cap')::integer then
        raise exception 'daily_cap_reached' using errcode = 'P0001';
      end if;
      st.box_count := case when st.box_week = week then st.box_count + 1 else 1 end;
      st.box_week := week;
      price := (shop -> 'box' ->> 'price')::integer;
      cards := (shop -> 'box' ->> 'cards')::integer;
      last_min := (shop -> 'box' ->> 'guaranteed_slot_min_rarity')::public.rarity_tier;
    when 'qualifiers' then
      if st.qualifiers_day = today and st.qualifiers_count >= (shop -> 'qualifiers' ->> 'daily_cap')::integer then
        raise exception 'daily_cap_reached' using errcode = 'P0001';
      end if;
      st.qualifiers_count := case when st.qualifiers_day = today then st.qualifiers_count + 1 else 1 end;
      st.qualifiers_day := today;
      price := (shop -> 'qualifiers' ->> 'price')::integer;
      cards := (shop -> 'qualifiers' ->> 'cards')::integer;
      last_min := 'common';
      max_tier := (shop -> 'qualifiers' ->> 'max_rarity')::public.rarity_tier;
  end case;

  if price > 0 then
    select coalesce(sum(amount), 0) into balance from public.ledger where user_id = uid;
    if balance < price then
      raise exception 'insufficient_balance' using errcode = 'P0001';
    end if;
    -- The ledger trigger re-checks the balance under its own lock.
    insert into public.ledger (user_id, amount, reason, ref, idempotency_key)
    values (uid, -price, 'booster_purchase', opening::text, 'booster:' || uid || ':' || p_request_id);
  end if;

  -- Golden booster and top-rarity guarantee (standard 5-card boosters only).
  if standard then
    is_golden := st.golden_counter + 1 >= (golden_cfg ->> 'pity_at')::integer
                 or private.rand_unit(seed, 'golden') * 10000 < (golden_cfg ->> 'chance_bp')::numeric;
    if is_golden then
      last_min := greatest(last_min, (golden_cfg ->> 'min_rarity')::public.rarity_tier);
    end if;
    force_mythic := st.mythic_counter + 1 >= (mythic_cfg ->> 'pity_at')::integer;
  end if;

  insert into public.booster_openings (id, user_id, opened_at, source, seed, request_id, golden, mythic_pity, pool, card_count)
  values (opening, uid, now_ts, p_source, seed, p_request_id, is_golden, force_mythic, pool_key, cards);

  perform private.draw_cards(uid, opening, seed, now_ts, cards, last_min, max_tier, pool,
                             case when force_mythic then 'mythic'::public.rarity_tier end);

  if standard then
    st.golden_counter := case when is_golden then 0 else st.golden_counter + 1 end;
    st.mythic_counter := case
      when exists (select 1 from public.booster_opening_cards where opening_id = opening and rarity = 'mythic') then 0
      else st.mythic_counter + 1 end;
  end if;

  update public.booster_state
  set stock = st.stock, last_refill_at = st.last_refill_at, bonus_stock = st.bonus_stock,
      aces_purchases_day = st.aces_purchases_day, aces_purchases_count = st.aces_purchases_count,
      golden_counter = st.golden_counter, mythic_counter = st.mythic_counter,
      daily_claimed_on = st.daily_claimed_on, box_week = st.box_week, box_count = st.box_count,
      qualifiers_day = st.qualifiers_day, qualifiers_count = st.qualifiers_count
  where user_id = uid;

  perform private.after_opening(uid, opening);

  return private.opening_json(opening) || jsonb_build_object('state', private.booster_state_json(uid, now_ts), 'replayed', false);
end;
$$;

-- Extension points, replaced by later migrations (anonymous trial, referral).
create function private.check_trial(p_uid uuid, p_source public.booster_source)
returns void
language plpgsql
set search_path = ''
as $$
begin
  return;
end;
$$;

create function private.after_opening(p_uid uuid, p_opening uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  return;
end;
$$;

-- 7. Recycling --------------------------------------------------------------

-- Copies that can be recycled: everything above the one kept copy.
-- Replaced by the grading migration (graded copies are never recycled).
create function private.recyclable_copies(p_uid uuid, p_player_id bigint, p_quantity integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, p_quantity - 1);
$$;

create table public.recycle_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id text not null check (length(request_id) between 8 and 100),
  at timestamptz not null default now(),
  copies integer not null check (copies > 0),
  aces integer not null check (aces > 0),
  items jsonb not null,                                   -- [{player_id, rarity, copies}]
  unique (user_id, request_id)
);
alter table public.recycle_events enable row level security;
grant select on public.recycle_events to authenticated;
create policy "own recycle events" on public.recycle_events
  for select to authenticated using (user_id = (select auth.uid()));

-- Duplicates the caller would recycle: every rarity up to p_max_rarity, or
-- one card only (p_player_id).
create function private.recycle_candidates(
  p_uid uuid, p_max_rarity public.rarity_tier, p_player_id bigint
)
returns table (player_id bigint, rarity public.rarity_tier, copies integer, aces integer)
language sql
stable
set search_path = ''
as $$
  select uc.player_id, p.rarity_effective,
         private.recyclable_copies(p_uid, uc.player_id, uc.quantity),
         private.recyclable_copies(p_uid, uc.player_id, uc.quantity)
           * (private.config('recycle_values') ->> p.rarity_effective::text)::integer
  from public.user_cards uc
  join public.players p on p.id = uc.player_id
  where uc.user_id = p_uid
    and (p_player_id is null or uc.player_id = p_player_id)
    and (p_player_id is not null or p.rarity_effective <= p_max_rarity)
    and private.recyclable_copies(p_uid, uc.player_id, uc.quantity) > 0;
$$;

-- What a bulk recycle would give, without doing it.
create function public.recycle_preview(p_max_rarity public.rarity_tier default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  max_tier public.rarity_tier := coalesce(p_max_rarity,
    (private.config('recycle') ->> 'bulk_max_rarity')::public.rarity_tier);
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  return (
    select jsonb_build_object(
      'max_rarity', max_tier,
      'copies', coalesce(sum(copies), 0),
      'aces', coalesce(sum(aces), 0),
      'by_rarity', coalesce(jsonb_object_agg(rarity, copies) filter (where rarity is not null), '{}'::jsonb))
    from (select rarity, sum(copies)::integer copies, sum(aces)::integer aces
          from private.recycle_candidates(uid, max_tier, null) group by rarity) s
  );
end;
$$;

-- Recycles duplicates (bulk up to p_max_rarity, or a single card with
-- p_player_id) into aces. Idempotent on p_request_id.
create function public.recycle_duplicates(
  p_request_id text, p_max_rarity public.rarity_tier default null, p_player_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  max_tier public.rarity_tier := coalesce(p_max_rarity,
    (private.config('recycle') ->> 'bulk_max_rarity')::public.rarity_tier);
  ev public.recycle_events;
  total_copies integer;
  total_aces integer;
  items jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_request_id is null or length(p_request_id) not between 8 and 100 then
    raise exception 'invalid_request_id' using errcode = 'invalid_parameter_value';
  end if;
  -- Same lock as the openings: a recycle never races a draw.
  perform 1 from public.booster_state where user_id = uid for update;

  select * into ev from public.recycle_events where user_id = uid and request_id = p_request_id;
  if found then
    return jsonb_build_object('copies', ev.copies, 'aces', ev.aces, 'replayed', true,
      'balance', (select coalesce(sum(amount), 0) from public.ledger where user_id = uid));
  end if;

  select coalesce(sum(copies), 0), coalesce(sum(aces), 0),
         coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'rarity', rarity, 'copies', copies)), '[]'::jsonb)
  into total_copies, total_aces, items
  from private.recycle_candidates(uid, max_tier, p_player_id);

  if total_copies = 0 then
    raise exception 'nothing_to_recycle' using errcode = 'P0001';
  end if;

  update public.user_cards uc
  set quantity = uc.quantity - (i ->> 'copies')::integer
  from jsonb_array_elements(items) i
  where uc.user_id = uid and uc.player_id = (i ->> 'player_id')::bigint;

  insert into public.recycle_events (user_id, request_id, copies, aces, items)
  values (uid, p_request_id, total_copies, total_aces, items)
  returning * into ev;

  insert into public.ledger (user_id, amount, reason, ref, idempotency_key)
  values (uid, total_aces, 'recycle', ev.id::text, 'recycle:' || uid || ':' || p_request_id);

  return jsonb_build_object('copies', total_copies, 'aces', total_aces, 'replayed', false,
    'balance', (select coalesce(sum(amount), 0) from public.ledger where user_id = uid));
end;
$$;

-- 8. Privileges -------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.open_booster(public.booster_source, text, text), public.set_wishlist(bigint, boolean),
  public.recycle_preview(public.rarity_tier), public.recycle_duplicates(text, public.rarity_tier, bigint),
  public.catalog_number(bigint), public.catalog_size()
from public, anon;
grant execute on function
  public.open_booster(public.booster_source, text, text), public.set_wishlist(bigint, boolean),
  public.recycle_preview(public.rarity_tier), public.recycle_duplicates(text, public.rarity_tier, bigint)
to authenticated;
-- Catalogue numbers are public information (card fronts are public).
grant execute on function public.catalog_number(bigint), public.catalog_size() to anon, authenticated;
