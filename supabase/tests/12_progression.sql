-- Booster progression: golden booster, top-rarity guarantee, pools, daily
-- booster, shop formats, wishlist, catalogue numbers, recycling.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'u3@test.local');

-- 4 players per tier: 2 men (right-handed), 2 women (left-handed, legends).
insert into public.players (wikidata_id, slug, name, sex, hand, career_end_year, rarity)
select 'Q' || (940000000 + t.n * 10 + i), 'prog-' || t.n || '-' || i, 'Prog ' || t.n || '-' || i,
       case when i <= 2 then 'male' else 'female' end::public.player_sex,
       case when i <= 2 then 'right' else 'left' end::public.playing_hand,
       case when i <= 2 then null else 1985 end,
       t.tier
from (select tier, row_number() over () as n from unnest(enum_range(null::public.rarity_tier)) tier) t,
     generate_series(1, 4) i;

create temp table results (n serial, body jsonb);
grant all on results to authenticated;
grant usage on sequence results_n_seq to authenticated;

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- Golden booster: never by chance, guaranteed every 3rd booster ------------
update public.game_config set value = '{"chance_bp":0,"pity_at":3,"min_rarity":"rare"}' where key = 'golden_booster';
update public.booster_state set stock = 10 where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((public.get_booster_state() ->> 'golden_in')::int, 3, 'golden booster announced in 3 boosters');
insert into results (body) select public.open_booster('free', 'golden-0001');
insert into results (body) select public.open_booster('free', 'golden-0002');
select is((public.get_booster_state() ->> 'golden_in')::int, 1, 'the counter goes down with each booster');
insert into results (body) select public.open_booster('free', 'golden-0003');
select is((select array_agg((body ->> 'golden')::boolean order by n) from results),
  array[false, false, true], 'the 3rd booster without a golden one is golden');
select ok((select (body -> 'cards' -> 4 ->> 'rarity')::public.rarity_tier >= 'rare' from results where n = 3),
  'a golden booster''s last slot is rare or better');
select is((public.get_booster_state() ->> 'golden_in')::int, 3, 'the counter restarts after a golden booster');
reset role;

update public.game_config set value = '{"chance_bp":10000,"pity_at":30,"min_rarity":"rare"}' where key = 'golden_booster';
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into results (body) select public.open_booster('free', 'golden-0004');
select is((select (body ->> 'golden')::boolean from results where n = 4), true, 'golden boosters also happen by chance');
reset role;
update public.game_config set value = '{"chance_bp":0,"pity_at":1000,"min_rarity":"rare"}' where key = 'golden_booster';

-- Mythic guarantee -----------------------------------------------------------
update public.game_config set value = '{"pity_at":2}' where key = 'mythic_pity';
update public.game_config set value = '{"common":10000,"uncommon":0,"rare":0,"epic":0,"legendary":0,"mythic":0}'
  where key = 'drop_rates';
update public.game_config set value = jsonb_set(value, '{guaranteed_slot_min_rarity}', '"common"') where key = 'booster';
update public.booster_state set mythic_counter = 0 where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into results (body) select public.open_booster('free', 'pity-0001');
select is((select body -> 'cards' -> 4 ->> 'rarity' from results where n = 5), 'common',
  'no mythic before the guarantee');
select is((public.get_booster_state() ->> 'mythic_in')::int, 1, 'the guarantee is announced');
insert into results (body) select public.open_booster('free', 'pity-0002');
select is((select body -> 'cards' -> 4 ->> 'rarity' from results where n = 6), 'mythic',
  'the guarantee gives a mythic card in the last slot');
select is((select (body ->> 'mythic_pity')::boolean from results where n = 6), true, 'the forced slot is flagged');
select is((public.get_booster_state() ->> 'mythic_in')::int, 2, 'the guarantee restarts after a mythic card');
reset role;
update public.game_config set value = '{"pity_at":300}' where key = 'mythic_pity';
update public.game_config set value = '{"common":5500,"uncommon":2700,"rare":1200,"epic":450,"legendary":130,"mythic":20}'
  where key = 'drop_rates';
update public.game_config set value = jsonb_set(value, '{guaranteed_slot_min_rarity}', '"uncommon"') where key = 'booster';

-- Pools ----------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into results (body) select public.open_booster('free', 'pool-0001', 'women');
select is((select count(*)::int from jsonb_array_elements((select body -> 'cards' from results where n = 7)) c
           join public.players p on p.id = (c ->> 'player_id')::bigint where p.sex = 'female'), 5,
  'the women pool only draws women');
select is((select body ->> 'pool' from results where n = 7), 'women', 'the pool is recorded');
select throws_ok($$select public.open_booster('free', 'pool-0002', 'nope')$$, 'P0001', 'invalid_pool',
  'unknown pools are refused');
reset role;
select is(private.pick_player_in_pool('epic', 0.5, '{"country":"FR"}', current_date)
            in (select id from public.players where rarity_effective = 'epic'), true,
  'an empty pool tier falls back to the whole tier (odds unchanged)');
select is((select count(*)::int from public.players p where private.in_pool(p, '{"career_end_before":1990,"hand":"left"}', current_date)),
  12, 'pool filters combine');

-- Daily booster ------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is((public.get_booster_state() ->> 'daily_available')::boolean, true, 'the daily booster is available');
insert into results (body) select public.open_booster('daily', 'daily-0001');
select ok((select (body -> 'cards' -> 4 ->> 'rarity')::public.rarity_tier >= 'rare' from results where n = 8),
  'the daily booster''s last slot is rare or better');
select is((public.get_booster_state() ->> 'stock')::int, 1, 'the daily booster does not use the stock');
select throws_ok($$select public.open_booster('daily', 'daily-0002')$$, 'P0001', 'daily_already_claimed',
  'one daily booster per day');
reset role;
select is((select body ->> 'pool' from results where n = 8), private.daily_theme(private.paris_today(now())) ->> 'key',
  'the daily booster uses the theme of the day');
select is(private.daily_theme(date '2027-05-30') ->> 'key', 'rolandGarros', 'calendar themes win during their window');
select isnt(private.daily_theme(date '2027-03-01') ->> 'key', null, 'outside the calendar, the rotation applies');

-- Shop -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select throws_ok($$select public.open_booster('box', 'box-0001')$$, 'P0001', 'insufficient_balance',
  'the box needs aces');
reset role;
insert into public.ledger (user_id, amount, reason, idempotency_key)
values ('22222222-2222-2222-2222-222222222222', 1000, 'admin_adjustment', 'test-credit-shop');
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
insert into results (body) select public.open_booster('box', 'box-0002');
select is(jsonb_array_length((select body -> 'cards' from results where n = 9)), 20, 'the box holds 20 cards');
select ok((select (body -> 'cards' -> 19 ->> 'rarity')::public.rarity_tier >= 'epic' from results where n = 9),
  'the box guarantees an epic card or better');
select throws_ok($$select public.open_booster('box', 'box-0003')$$, 'P0001', 'daily_cap_reached', 'one box per week');
insert into results (body) select public.open_booster('qualifiers', 'qual-0001');
select is(jsonb_array_length((select body -> 'cards' from results where n = 10)), 3, 'qualifiers hold 3 cards');
select lives_ok($$select public.open_booster('qualifiers', 'qualifier-' || g) from generate_series(2, 3) g$$,
  'three qualifiers per day');
select throws_ok($$select public.open_booster('qualifiers', 'qual-0004')$$, 'P0001', 'daily_cap_reached',
  'qualifiers daily cap');
select is((public.get_booster_state() ->> 'aces')::int, 1000 - 450 - 3 * 40, 'shop prices are debited');
reset role;
select is_empty($$select 1 from public.booster_opening_cards c join public.booster_openings o on o.id = c.opening_id
                  where o.source = 'qualifiers' and c.rarity > 'rare'$$, 'qualifiers never draw above rare');

-- Wishlist ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select is(public.set_wishlist((select id from public.players where slug = 'prog-1-1'), true), true, 'a card can be wished');
select is((select count(*)::int from public.wishlist), 1, 'the wishlist is readable by its owner');
reset role;
update public.game_config set value = '{"common":10000,"uncommon":0,"rare":0,"epic":0,"legendary":0,"mythic":0}'
  where key = 'drop_rates';
update public.game_config set value = jsonb_set(value, '{guaranteed_slot_min_rarity}', '"common"') where key = 'booster';
update public.players set in_catalog = false where rarity = 'common' and slug <> 'prog-1-1';
set local role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into results (body) select public.open_booster('free', 'wish-0001');
select is((select (body -> 'cards' -> 0 ->> 'was_wished')::boolean from results where n = 11), true,
  'a wished card is flagged when drawn');
select is((select count(*)::int from public.wishlist), 0, 'a drawn card leaves the wishlist');
select throws_ok(format('select public.set_wishlist(%s, true)', (select id from public.players where slug = 'prog-1-1')),
  'P0001', 'already_owned', 'owned cards cannot be wished');

-- Recycling: 5 copies of the same common card ------------------------------------------
select is((public.recycle_preview() ->> 'copies')::int, 4, 'preview counts the copies above one');
select is((public.recycle_preview() ->> 'aces')::int, 4, 'preview counts the aces');
insert into results (body) select public.recycle_duplicates('recycle-0001');
select is((select (body ->> 'aces')::int from results where n = 12), 4, 'bulk recycling credits the aces');
select is((select quantity from public.user_cards), 1, 'one copy is always kept');
insert into results (body) select public.recycle_duplicates('recycle-0001');
select is((select (body ->> 'replayed')::boolean from results where n = 13), true, 'recycling is idempotent');
select is((select count(*)::int from public.ledger where reason = 'recycle'), 1, 'a replay credits nothing');
select throws_ok($$select public.recycle_duplicates('recycle-0002')$$, 'P0001', 'nothing_to_recycle',
  'nothing left to recycle');
reset role;

-- Bulk recycling keeps rarities above the limit unless asked
update public.user_cards set quantity = 3 where user_id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select lives_ok($$select public.recycle_duplicates('recycle-0003')$$, 'bulk recycling runs');
select is_empty($$select 1 from public.user_cards uc join public.players p on p.id = uc.player_id
                  where p.rarity_effective <= 'rare' and uc.quantity > 1$$, 'bulk recycling empties duplicates up to rare');
select ok(exists (select 1 from public.user_cards uc join public.players p on p.id = uc.player_id
                  where p.rarity_effective > 'rare' and uc.quantity = 3), 'higher rarities are kept by default');
reset role;

select is(public.catalog_number((select min(id) from public.players where in_catalog)), 1, 'catalogue numbers start at 1');

select * from finish();
rollback;
