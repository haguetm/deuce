-- Social layer: username and profile preferences, public profile with a
-- showcase, big pulls feed, global counters, shareable openings, referral.
--
-- Privacy: a player appears in the feed or on a public page only with a
-- username they chose, and can opt out of both (show_in_feed,
-- public_profile). Nothing here exposes an email or an auth identifier.

-- 1. Profile ----------------------------------------------------------------

alter table public.profiles
  add column show_in_feed boolean not null default true,
  add column public_profile boolean not null default true,
  add column badges text[] not null default '{}';

alter table public.booster_openings add column shared_at timestamptz;  -- set when the owner shares it
grant select (shared_at) on public.booster_openings to authenticated;

create function public.set_username(p_username text)
returns text
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
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'invalid_username' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username) and id <> uid) then
    raise exception 'username_taken' using errcode = 'P0001';
  end if;
  update public.profiles set username = p_username where id = uid;
  return p_username;
end;
$$;

create function public.set_profile_preferences(p_show_in_feed boolean, p_public_profile boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles
  set show_in_feed = coalesce(p_show_in_feed, show_in_feed),
      public_profile = coalesce(p_public_profile, public_profile)
  where id = auth.uid();
end;
$$;

-- Showcase: up to game_config.showcase_size cards the caller owns.
create function public.set_showcase(p_player_ids bigint[])
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ids bigint[] := coalesce(p_player_ids, '{}');
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if cardinality(ids) > (private.config('showcase_size'))::integer
     or cardinality(ids) <> (select count(distinct x) from unnest(ids) x) then
    raise exception 'invalid_showcase' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(ids) x
             where not exists (select 1 from public.user_cards where user_id = uid and player_id = x)) then
    raise exception 'not_owned' using errcode = 'P0001';
  end if;
  update public.profiles set showcase = ids where id = uid;
  return ids;
end;
$$;

-- Card front as shown publicly (photo with its credit, or null = silhouette).
create function private.card_front_json(p_player_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'player_id', p.id, 'slug', p.slug, 'name', p.name, 'country_code', p.country_code,
    'rarity', p.rarity_effective, 'catalog_number', public.catalog_number(p.id),
    'image', (select jsonb_build_object(
                'path', i.storage_path, 'width', i.width, 'height', i.height,
                'author', i.author, 'license', i.license,
                'license_url', i.license_url, 'source_url', i.source_url)
              from public.player_images i
              where i.player_id = p.id and i.is_primary and not i.hidden))
  from public.players p
  where p.id = p_player_id and p.in_catalog;
$$;

create function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pr public.profiles;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  select * into pr from public.profiles where id = uid;
  return jsonb_build_object(
    'username', pr.username,
    'referral_code', pr.referral_code,
    'show_in_feed', pr.show_in_feed,
    'public_profile', pr.public_profile,
    'badges', to_jsonb(pr.badges),
    'showcase', coalesce((select jsonb_agg(private.card_front_json(x) order by o)
                          from unnest(pr.showcase) with ordinality s(x, o)), '[]'::jsonb),
    'is_anonymous', coalesce((select is_anonymous from auth.users where id = uid), false),
    'distinct_cards', (select count(*) from public.user_cards where user_id = uid),
    'catalog_size', public.catalog_size()
  );
end;
$$;

-- Public profile page. Only for players who chose a username and kept their
-- profile public.
create function public.get_public_profile(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'username', pr.username,
    'since', pr.created_at,
    'badges', to_jsonb(pr.badges),
    'distinct_cards', (select count(*) from public.user_cards where user_id = pr.id),
    'catalog_size', public.catalog_size(),
    'showcase', coalesce((select jsonb_agg(private.card_front_json(x) order by o)
                          from unnest(pr.showcase) with ordinality s(x, o)
                          where exists (select 1 from public.user_cards where user_id = pr.id and player_id = x)),
                         '[]'::jsonb))
  from public.profiles pr
  where lower(pr.username) = lower(p_username) and pr.public_profile;
$$;

-- 2. Feed and counters ----------------------------------------------------

-- Recent big pulls (game_config.feed). Username only when chosen and visible.
create function public.get_big_pulls(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(f)::jsonb order by f.opened_at desc), '[]'::jsonb)
  from (
    select o.opened_at, c.rarity, p.name, p.slug, p.country_code,
           case when pr.show_in_feed then pr.username end as username
    from public.booster_opening_cards c
    join public.booster_openings o on o.id = c.opening_id
    join public.players p on p.id = c.player_id
    join public.profiles pr on pr.id = o.user_id
    where c.rarity >= (private.config('feed') ->> 'min_rarity')::public.rarity_tier
      and o.opened_at > now() - make_interval(hours => (private.config('feed') ->> 'hours')::integer)
    order by o.opened_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) f;
$$;

create index booster_opening_cards_rarity_idx on public.booster_opening_cards (rarity)
  where rarity in ('legendary', 'mythic');
create index booster_openings_opened_at_idx on public.booster_openings (opened_at);

create function public.get_global_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'boosters_opened', (select count(*) from public.booster_openings),
    'cards_drawn', (select count(*) from public.booster_opening_cards),
    'mythic_drawn', (select count(*) from public.booster_opening_cards where rarity = 'mythic'),
    'players', (select count(*) from public.profiles),
    'catalog_size', public.catalog_size()
  );
$$;

-- 3. Shared openings ---------------------------------------------------------

-- The owner marks an opening as shared; its link then shows the cards.
create function public.share_opening(p_opening uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.booster_openings set shared_at = coalesce(shared_at, now())
  where id = p_opening and user_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return p_opening;
end;
$$;

create function public.get_shared_opening(p_opening uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'opening_id', o.id, 'opened_at', o.opened_at, 'source', o.source, 'golden', o.golden,
    'username', case when pr.public_profile then pr.username end,
    'catalog_size', public.catalog_size(),
    'cards', (select jsonb_agg(private.card_front_json(c.player_id)
                               || jsonb_build_object('slot', c.slot, 'rarity', c.rarity, 'was_new', c.was_new)
                               order by c.slot)
              from public.booster_opening_cards c where c.opening_id = o.id))
  from public.booster_openings o
  join public.profiles pr on pr.id = o.user_id
  where o.id = p_opening and o.shared_at is not null;
$$;

-- 4. Referral ----------------------------------------------------------------
-- Public rewards (game_config.referral); private qualification thresholds
-- (private.settings). A referee is rewarded once, after enough activity.

-- The caller declares who invited them (new accounts only).
create function public.claim_referral(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  referrer uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  select id into referrer from public.profiles where referral_code = lower(trim(p_code));
  if referrer is null or referrer = uid then
    raise exception 'invalid_referral_code' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.referrals where referee_id = uid) then
    raise exception 'already_referred' using errcode = 'P0001';
  end if;
  if (select created_at from public.profiles where id = uid) < now() - interval '7 days' then
    raise exception 'referral_too_late' using errcode = 'P0001';
  end if;
  insert into public.referrals (referrer_id, referee_id) values (referrer, uid);
  perform private.qualify_referral(uid);
  return 'pending';
end;
$$;

-- Qualifies and rewards the caller's pending referral once the private
-- thresholds are met. Called after each opening and after a claim.
create function private.qualify_referral(p_referee uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  ref public.referrals;
  cfg jsonb := private.config('referral');
  usr record;
  rewarded_today integer;
  rewarded_total integer;
  milestone jsonb;
begin
  select * into ref from public.referrals where referee_id = p_referee and status = 'pending' for update;
  if not found then
    return;
  end if;
  select u.email_confirmed_at, u.created_at, coalesce(u.is_anonymous, false) as is_anonymous
  into usr from auth.users u where u.id = p_referee;

  if usr.is_anonymous
     or ((private.setting('referral_require_verified_email'))::boolean and usr.email_confirmed_at is null)
     or (select count(*) from public.booster_openings where user_id = p_referee)
          < (private.setting('referral_min_boosters_opened'))::integer
     or usr.created_at > now() - make_interval(hours => (private.setting('referral_min_account_age_hours'))::integer)
  then
    return;
  end if;

  select count(*) filter (where rewarded_at >= now() - interval '1 day'), count(*)
  into rewarded_today, rewarded_total
  from public.referrals where referrer_id = ref.referrer_id and status = 'rewarded';

  if rewarded_today >= (private.setting('referral_max_rewards_per_day'))::integer
     or rewarded_total >= (private.setting('referral_max_rewards_total'))::integer then
    -- Qualified but over the referrer's limits: the referee still gets the welcome gift.
    update public.referrals set status = 'qualified', qualified_at = now() where id = ref.id;
    update public.booster_state set bonus_stock = bonus_stock + (cfg ->> 'referee_boosters')::integer
    where user_id = p_referee;
    return;
  end if;

  update public.referrals set status = 'rewarded', qualified_at = now(), rewarded_at = now() where id = ref.id;
  update public.booster_state set bonus_stock = bonus_stock + (cfg ->> 'referee_boosters')::integer
  where user_id = p_referee;
  update public.booster_state set bonus_stock = bonus_stock + (cfg ->> 'referrer_boosters')::integer
  where user_id = ref.referrer_id;

  -- Milestones of the referrer (rewarded referrals only).
  select m into milestone from jsonb_array_elements(cfg -> 'milestones') m
  where (m ->> 'referrals')::integer = rewarded_total + 1;
  if milestone is not null then
    update public.booster_state set bonus_stock = bonus_stock + (milestone ->> 'boosters')::integer
    where user_id = ref.referrer_id;
    if milestone ->> 'badge' is not null then
      update public.profiles set badges = array_append(badges, milestone ->> 'badge')
      where id = ref.referrer_id and not (milestone ->> 'badge' = any (badges));
    end if;
  end if;
end;
$$;

create or replace function private.after_opening(p_uid uuid, p_opening uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.qualify_referral(p_uid);
end;
$$;

create function public.get_referral_status()
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
    'code', (select referral_code from public.profiles where id = uid),
    'rewarded', (select count(*) from public.referrals where referrer_id = uid and status = 'rewarded'),
    'pending', (select count(*) from public.referrals where referrer_id = uid and status = 'pending'),
    'referred', (select status from public.referrals where referee_id = uid),
    'can_claim', not exists (select 1 from public.referrals where referee_id = uid)
                 and (select created_at from public.profiles where id = uid) >= now() - interval '7 days',
    'rewards', private.config('referral')
  );
end;
$$;

-- 5. Privileges -------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.set_username(text), public.set_profile_preferences(boolean, boolean), public.set_showcase(bigint[]),
  public.get_my_profile(), public.get_public_profile(text), public.get_big_pulls(integer),
  public.get_global_stats(), public.share_opening(uuid), public.get_shared_opening(uuid),
  public.claim_referral(text), public.get_referral_status()
from public, anon;
grant execute on function
  public.set_username(text), public.set_profile_preferences(boolean, boolean), public.set_showcase(bigint[]),
  public.get_my_profile(), public.share_opening(uuid), public.claim_referral(text), public.get_referral_status()
to authenticated;
-- Public pages (feed, counters, profiles, shared openings) work without an account.
grant execute on function
  public.get_public_profile(text), public.get_big_pulls(integer), public.get_global_stats(),
  public.get_shared_opening(uuid)
to anon, authenticated;
