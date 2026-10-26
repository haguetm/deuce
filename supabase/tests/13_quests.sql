-- Login streak, quests, achievements and albums.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local');

-- 6 French players (one per tier) and 2 Spanish ones; one French champion of each major.
insert into public.players (wikidata_id, slug, name, sex, hand, country_code, rarity)
select 'Q' || (950000000 + t.n), 'quest-' || t.n, 'Quest ' || t.n, 'male',
       case when t.n = 1 then 'left' else 'right' end::public.playing_hand, 'FR', t.tier
from (select tier, row_number() over () as n from unnest(enum_range(null::public.rarity_tier)) tier) t;
insert into public.players (wikidata_id, slug, name, sex, country_code, rarity) values
  ('Q950000101', 'roger-federer', 'Big One', 'male', 'ES', 'mythic'),
  ('Q950000102', 'quest-es-2', 'Quest ES 2', 'female', 'ES', 'common');
insert into public.player_stats (player_id, key, value_num, source_id)
select p.id, k.key, 1, 'sackmann_atp'
from public.players p
join (values ('quest-3', 'australian_open_titles'), ('quest-4', 'roland_garros_titles'),
             ('quest-5', 'wimbledon_titles'), ('quest-6', 'us_open_titles')) k(slug, key) on k.slug = p.slug;

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- Login streak ----------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((public.get_quests() -> 'streak' ->> 'next_day')::int, 1, 'a new player starts at day 1');
select is((public.claim_login_streak() ->> 'aces')::int, 5, 'day 1 pays the first reward');
select throws_ok('select public.claim_login_streak()', 'P0001', 'already_claimed', 'once per day');
reset role;

-- Yesterday was day 6: today is day 7 with the bonus booster.
update public.login_streaks set day_index = 6, last_claim_on = private.paris_today(now()) - 1
where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is(public.claim_login_streak() - 'grace_used', '{"day":7,"aces":25,"boosters":1}'::jsonb,
  'day 7 pays 25 aces and a bonus booster');
select is((public.get_booster_state() ->> 'bonus_stock')::int, 1, 'the bonus booster is credited');
reset role;

-- One missed day is tolerated once a week
update public.login_streaks set day_index = 2, last_claim_on = private.paris_today(now()) - 2, grace_used = 0, grace_week = null
where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((public.claim_login_streak() ->> 'day')::int, 3, 'a single missed day keeps the streak');
reset role;
update public.login_streaks set day_index = 3, last_claim_on = private.paris_today(now()) - 2
where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((public.claim_login_streak() ->> 'day')::int, 1, 'a second missed day in the week resets the streak');
reset role;
update public.login_streaks set day_index = 5, last_claim_on = private.paris_today(now()) - 3
where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((public.claim_login_streak() ->> 'day')::int, 1, 'two missed days reset the streak');
select is((select sum(amount)::int from public.ledger where reason = 'login_streak'), 5 + 25 + 10 + 5 + 5,
  'every claim is in the ledger');
reset role;

-- Quests --------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select throws_ok('select public.claim_quests()', 'P0001', 'nothing_to_claim', 'nothing to claim at first');
select is((select count(*)::int from jsonb_array_elements(public.get_quests() -> 'quests') q where q ->> 'kind' = 'daily'),
  3, 'three daily quests');
select lives_ok($$select public.open_booster('free', 'quest-open-0001')$$, 'opening a booster');
select is((select (q ->> 'progress')::int from jsonb_array_elements(public.get_quests() -> 'quests') q
           where q ->> 'kind' = 'welcome' and q ->> 'key' = 'firstBooster'), 1, 'progress is computed from the openings');
select ok((public.claim_quests('welcome', 'firstBooster') ->> 'aces')::int = 10, 'a completed quest pays its reward');
select throws_ok($$select public.claim_quests('welcome', 'firstBooster')$$, 'P0001', 'nothing_to_claim',
  'a quest pays once');
select ok((select (q ->> 'claimed')::boolean from jsonb_array_elements(public.get_quests() -> 'quests') q
           where q ->> 'kind' = 'achievement' and q ->> 'key' = 'firstServe') = false, 'achievement not claimed yet');
select ok((public.claim_quests('achievement') ->> 'claimed')::int >= 1, 'achievements are claimable');
reset role;
select is((select count(*)::int from public.ledger where user_id = '22222222-2222-2222-2222-222222222222'
           and reason = 'achievement'), (select count(*)::int from public.quest_claims
           where user_id = '22222222-2222-2222-2222-222222222222' and kind = 'achievement' and reward > 0),
  'one ledger line per paid achievement');

-- Daily bonus: once every daily quest is claimed
insert into public.quest_claims (user_id, kind, quest_key, period)
select '22222222-2222-2222-2222-222222222222', 'daily', q ->> 'key', private.paris_today(now())::text
from private.daily_quests(private.paris_today(now())) q;
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is((public.claim_quests() ->> 'boosters')::int, 1, 'all daily quests claimed: one bonus booster');
select is((public.get_quests() -> 'bonus' ->> 'daily_claimed')::boolean, true, 'the daily bonus is marked as claimed');
reset role;

-- Metrics ---------------------------------------------------------------------------
insert into public.user_cards (user_id, player_id, quantity)
select '11111111-1111-1111-1111-111111111111', id, 1 from public.players where country_code = 'FR';
select is(private.metric('11111111-1111-1111-1111-111111111111', 'career_slam', null), 1,
  'owning a champion of each major completes the career slam');
select is(private.metric('11111111-1111-1111-1111-111111111111', 'albums_complete', null), 1,
  'the French album (6 cards) is complete');
select is(private.metric('11111111-1111-1111-1111-111111111111', 'collection_complete', null, 'bigThree'), 0,
  'the Big Three collection is not complete');
select is(private.metric('11111111-1111-1111-1111-111111111111', 'has_rarity_mythic', null), 1, 'owns a mythic card');

-- Albums --------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((public.get_albums() -> 'nations' -> 0 ->> 'country'), 'FR', 'nation albums list the complete ones first');
select is((public.get_albums() -> 'nations' -> 0 -> 'by_rarity' -> 'mythic'), '[1, 1]'::jsonb,
  'albums give owned and total per rarity');
select is(jsonb_array_length(public.get_albums() -> 'nations'), 1, 'nations with fewer than 5 cards have no album');
select is((select c ->> 'total' from jsonb_array_elements(public.get_albums() -> 'collections') c
           where c ->> 'key' = 'bigThree'), '1', 'collections list their catalogue members');
reset role;

select * from finish();
rollback;
