-- Booster loop: stock and refill, opening, rarity draw.
--
-- Why this is safe server-side:
--   * open_booster() is the only way to obtain cards. It runs as SECURITY
--     DEFINER, acts only for auth.uid(), locks the caller's booster_state row
--     (FOR UPDATE) so concurrent calls are serialized, and checks the stock
--     inside the same transaction that writes the cards.
--   * Randomness comes from the server (gen_random_bytes). Each opening keeps
--     its 32-byte seed; every draw is derived from it with HMAC-SHA256, so an
--     opening can be replayed and audited against the catalogue.
--   * Parameters (rates, refill, caps) come from public.game_config, which
--     clients can read but never write.
--   * A client-supplied request_id makes retries idempotent: replaying the
--     same id returns the first result instead of opening a second booster.

alter table public.booster_openings add column request_id text
  check (request_id is null or length(request_id) between 8 and 100);
create unique index booster_openings_request_idx
  on public.booster_openings (user_id, request_id) where request_id is not null;

create function private.config(p_key text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb;
begin
  select value into v from public.game_config where key = p_key;
  if v is null then
    raise exception 'game config % is missing (run pnpm config:generate and apply the seed)', p_key
      using errcode = 'no_data_found';
  end if;
  return v;
end;
$$;

-- Uniform number in [0, 1) derived from the opening seed and a label.
create function private.rand_unit(p_seed bytea, p_label text)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select ('x' || encode(substr(extensions.hmac(convert_to(p_label, 'UTF8'), p_seed, 'sha256'), 1, 6), 'hex'))
           ::bit(48)::bigint::double precision / 281474976710656.0;
$$;

-- Picks a rarity from game_config.drop_rates, restricted to p_min or better
-- (rates are renormalized over the allowed tiers).
create function private.draw_rarity(p_u double precision, p_min public.rarity_tier)
returns public.rarity_tier
language plpgsql
stable
set search_path = ''
as $$
declare
  rates jsonb := private.config('drop_rates');
  tier public.rarity_tier;
  total numeric := 0;
  acc numeric := 0;
begin
  foreach tier in array enum_range(null::public.rarity_tier) loop
    if tier >= p_min then
      total := total + (rates ->> tier::text)::numeric;
    end if;
  end loop;
  if total <= 0 then
    raise exception 'drop rates are empty from tier %', p_min;
  end if;
  foreach tier in array enum_range(null::public.rarity_tier) loop
    if tier >= p_min then
      acc := acc + (rates ->> tier::text)::numeric;
      if p_u * total < acc then
        return tier;
      end if;
    end if;
  end loop;
  return tier; -- floating-point edge (p_u * total == total): highest tier
end;
$$;

-- Uniform pick among catalogue players of a tier.
create function private.pick_player(p_rarity public.rarity_tier, p_u double precision)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  n integer;
  pid bigint;
begin
  select count(*) into n from public.players where in_catalog and rarity_effective = p_rarity;
  if n = 0 then
    raise exception 'no card in tier %', p_rarity using errcode = 'no_data_found';
  end if;
  select id into pid from public.players
  where in_catalog and rarity_effective = p_rarity
  order by id
  offset least(floor(p_u * n)::integer, n - 1) limit 1;
  return pid;
end;
$$;

-- Free stock after lazy refill: +1 every refill interval, capped. While the
-- stock is full the timer does not run (it restarts from p_now).
create function private.refreshed_stock(
  p_stock integer, p_last timestamptz, p_now timestamptz,
  out stock integer, out last_refill_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  cfg jsonb := private.config('booster');
  max_stock integer := (cfg ->> 'max_stock')::integer;
  step interval := make_interval(mins => (cfg ->> 'refill_minutes')::integer);
  elapsed integer;
begin
  if p_stock >= max_stock then
    stock := p_stock;
    last_refill_at := p_now;
    return;
  end if;
  elapsed := floor(extract(epoch from (p_now - p_last)) / extract(epoch from step))::integer;
  if elapsed <= 0 then
    stock := p_stock;
    last_refill_at := p_last;
    return;
  end if;
  stock := least(max_stock, p_stock + elapsed);
  last_refill_at := case when stock >= max_stock then p_now else p_last + elapsed * step end;
end;
$$;

create function private.booster_state_json(p_user uuid, p_now timestamptz)
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
  purchases integer;
begin
  select * into st from public.booster_state where user_id = p_user;
  if not found then
    raise exception 'no booster state for user' using errcode = 'no_data_found';
  end if;
  select * into fresh from private.refreshed_stock(st.stock, st.last_refill_at, p_now);
  purchases := case when st.aces_purchases_day = (p_now at time zone 'utc')::date then st.aces_purchases_count else 0 end;
  return jsonb_build_object(
    'stock', fresh.stock,
    'max_stock', (cfg ->> 'max_stock')::integer,
    'next_refill_at', case when fresh.stock >= (cfg ->> 'max_stock')::integer then null
                           else fresh.last_refill_at + make_interval(mins => (cfg ->> 'refill_minutes')::integer) end,
    'bonus_stock', st.bonus_stock,
    'aces_purchases_left', greatest(0, (aces ->> 'daily_cap')::integer - purchases)
  );
end;
$$;

-- Read-only view of the caller's booster state (stock recomputed on the fly).
create function public.get_booster_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  return private.booster_state_json(auth.uid(), now());
end;
$$;

create function private.opening_json(p_opening uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'opening_id', o.id,
    'opened_at', o.opened_at,
    'source', o.source,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slot', c.slot, 'player_id', c.player_id, 'slug', p.slug, 'name', p.name,
               'country_code', p.country_code, 'rarity', c.rarity, 'was_new', c.was_new)
             order by c.slot)
      from public.booster_opening_cards c
      join public.players p on p.id = c.player_id
      where c.opening_id = o.id), '[]'::jsonb)
  )
  from public.booster_openings o
  where o.id = p_opening;
$$;

-- Opens one booster for the caller. See the header comment for the safety
-- argument. Errors use stable messages that the UI maps to translations:
-- no_booster_available, daily_cap_reached, insufficient_balance.
create function public.open_booster(p_source public.booster_source, p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  now_ts timestamptz := now();
  today date := (now() at time zone 'utc')::date;
  st public.booster_state;
  fresh record;
  booster_cfg jsonb := private.config('booster');
  aces_cfg jsonb := private.config('aces_booster');
  cards integer := (booster_cfg ->> 'cards_per_booster')::integer;
  guaranteed public.rarity_tier := (booster_cfg ->> 'guaranteed_slot_min_rarity')::public.rarity_tier;
  price integer := (aces_cfg ->> 'price')::integer;
  purchases integer;
  balance bigint;
  existing uuid;
  opening uuid := gen_random_uuid();
  seed bytea := extensions.gen_random_bytes(32);
  slot integer;
  tier public.rarity_tier;
  pid bigint;
  is_new boolean;
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

  select * into fresh from private.refreshed_stock(st.stock, st.last_refill_at, now_ts);
  st.stock := fresh.stock;
  st.last_refill_at := fresh.last_refill_at;
  purchases := case when st.aces_purchases_day = today then st.aces_purchases_count else 0 end;

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
      if purchases >= (aces_cfg ->> 'daily_cap')::integer then
        raise exception 'daily_cap_reached' using errcode = 'P0001';
      end if;
      select coalesce(sum(amount), 0) into balance from public.ledger where user_id = uid;
      if balance < price then
        raise exception 'insufficient_balance' using errcode = 'P0001';
      end if;
      -- The ledger trigger re-checks the balance under its own lock.
      insert into public.ledger (user_id, amount, reason, ref, idempotency_key)
      values (uid, -price, 'booster_purchase', opening::text, 'booster:' || uid || ':' || p_request_id);
      st.aces_purchases_day := today;
      st.aces_purchases_count := purchases + 1;
  end case;

  update public.booster_state
  set stock = st.stock, last_refill_at = st.last_refill_at, bonus_stock = st.bonus_stock,
      aces_purchases_day = st.aces_purchases_day, aces_purchases_count = st.aces_purchases_count
  where user_id = uid;

  insert into public.booster_openings (id, user_id, opened_at, source, seed, request_id)
  values (opening, uid, now_ts, p_source, seed, p_request_id);

  for slot in 1..cards loop
    tier := private.draw_rarity(
      private.rand_unit(seed, 'rarity:' || slot),
      case when slot = cards then guaranteed else 'common'::public.rarity_tier end);
    pid := private.pick_player(tier, private.rand_unit(seed, 'card:' || slot));

    is_new := not exists (select 1 from public.user_cards where user_id = uid and player_id = pid);
    insert into public.user_cards (user_id, player_id, quantity, first_obtained_at, last_obtained_at)
    values (uid, pid, 1, now_ts, now_ts)
    on conflict (user_id, player_id) do update
      set quantity = public.user_cards.quantity + 1, last_obtained_at = now_ts;

    insert into public.booster_opening_cards (opening_id, slot, player_id, rarity, was_new)
    values (opening, slot, pid, tier, is_new);
  end loop;

  return private.opening_json(opening) || jsonb_build_object('state', private.booster_state_json(uid, now_ts), 'replayed', false);
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.open_booster(public.booster_source, text), public.get_booster_state()
  from public, anon;
grant execute on function public.open_booster(public.booster_source, text), public.get_booster_state()
  to authenticated;
