-- Profiles, showcase, feed, counters, shared openings, referral, anonymous
-- trial, grading and push notifications.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

insert into auth.users (id, email, email_confirmed_at, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local', now(), now() - interval '30 days'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local', now(), now() - interval '2 days'),
  ('33333333-3333-3333-3333-333333333333', 'u3@test.local', now(), now() - interval '2 days');
insert into auth.users (id, is_anonymous, created_at, last_sign_in_at) values
  ('44444444-4444-4444-4444-444444444444', true, now(), now()),
  ('55555555-5555-5555-5555-555555555555', true, now() - interval '40 days', now() - interval '40 days');

insert into public.players (wikidata_id, slug, name, sex, rarity)
select 'Q' || (960000000 + t.n * 10 + i), 'soc-' || t.n || '-' || i, 'Soc ' || t.n || '-' || i, 'male', t.tier
from (select tier, row_number() over () as n from unnest(enum_range(null::public.rarity_tier)) tier) t,
     generate_series(1, 2) i;

select public.set_private_setting('referral_require_verified_email', 'true');
select public.set_private_setting('referral_min_boosters_opened', '2');
select public.set_private_setting('referral_min_account_age_hours', '24');
select public.set_private_setting('referral_max_rewards_per_day', '5');
select public.set_private_setting('referral_max_rewards_total', '50');

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
create temp table results (n serial, body jsonb);
grant all on results to authenticated, anon;
grant usage on sequence results_n_seq to authenticated, anon;

-- Username, showcase, public profile -------------------------------------------
update public.booster_state set stock = 10 where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is(public.set_username('Rafa_fan'), 'Rafa_fan', 'a username can be chosen');
select throws_ok($$select public.set_username('no')$$, 'P0001', 'invalid_username', 'usernames are validated');
insert into results (body) select public.open_booster('free', 'social-open-0001');
select is(cardinality(public.set_showcase(array[(select (body -> 'cards' -> 0 ->> 'player_id')::bigint from results where n = 1)])),
  1, 'an owned card can be showcased');
select throws_ok(format('select public.set_showcase(array[%s])',
                        (select min(id) from public.players where id not in (select player_id from public.user_cards))),
  'P0001', 'not_owned', 'only owned cards can be showcased');
select is(jsonb_array_length(public.get_my_profile() -> 'showcase'), 1, 'my profile lists the showcase');
reset role;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select throws_ok($$select public.set_username('RAFA_FAN')$$, 'P0001', 'username_taken', 'usernames are unique, case-insensitively');
reset role;

set local role anon;
select is(public.get_public_profile('rafa_fan') ->> 'username', 'Rafa_fan', 'public profiles are visible without an account');
select is(jsonb_array_length(public.get_public_profile('rafa_fan') -> 'showcase'), 1, 'the public profile shows the showcase');
select ok((public.get_global_stats() ->> 'boosters_opened')::int >= 1, 'global counters are public');
reset role;

-- Feed ------------------------------------------------------------------------------
update public.game_config set value = '{"min_rarity":"common","hours":24}' where key = 'feed';
set local role anon;
select is((public.get_big_pulls() -> 0 ->> 'username'), 'Rafa_fan', 'the feed shows the chosen username');
reset role;
set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok($$select public.set_profile_preferences(false, false)$$, 'preferences can be changed');
reset role;
set local role anon;
select is((public.get_big_pulls() -> 0 -> 'username'), 'null'::jsonb, 'players can hide from the feed');
select is(public.get_public_profile('rafa_fan'), null, 'players can make their profile private');
reset role;

-- Shared openings ----------------------------------------------------------------
set local role anon;
select is(public.get_shared_opening((select (body ->> 'opening_id')::uuid from results where n = 1)), null,
  'an opening is private until shared');
reset role;
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select throws_ok(format('select public.share_opening(%L)', (select body ->> 'opening_id' from results where n = 1)),
  'P0001', 'not_found', 'only the owner can share an opening');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(format('select public.share_opening(%L)', (select body ->> 'opening_id' from results where n = 1)),
  'the owner shares an opening');
reset role;
set local role anon;
select is(jsonb_array_length(public.get_shared_opening((select (body ->> 'opening_id')::uuid from results where n = 1)) -> 'cards'),
  5, 'a shared opening shows its cards');
reset role;

-- Referral ------------------------------------------------------------------------
create temp table codes as select id, referral_code from public.profiles;
grant select on codes to authenticated;
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select throws_ok($$select public.claim_referral('nope')$$, 'P0001', 'invalid_referral_code', 'unknown codes are refused');
select is(public.claim_referral((select referral_code from codes where id = '11111111-1111-1111-1111-111111111111')),
  'pending', 'a new account can declare its referrer');
select throws_ok(format('select public.claim_referral(%L)',
                        (select referral_code from codes where id = '33333333-3333-3333-3333-333333333333')),
  'P0001', 'already_referred', 'one referrer per account');
select lives_ok($$select public.open_booster('free', 'referee-open-0001')$$, 'the referee opens a first booster');
reset role;
select is((select status::text from public.referrals), 'pending', 'not qualified before the private threshold');
update public.booster_state set stock = 5 where user_id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select lives_ok($$select public.open_booster('free', 'referee-open-0002')$$, 'the referee opens a second booster');
reset role;
select is((select status::text from public.referrals), 'rewarded', 'qualified and rewarded after the threshold');
select is((select bonus_stock from public.booster_state where user_id = '11111111-1111-1111-1111-111111111111'), 3,
  'the referrer gets the public reward');
select is((select bonus_stock from public.booster_state where user_id = '22222222-2222-2222-2222-222222222222'), 3,
  'the referee gets the public reward');
select is(private.metric('22222222-2222-2222-2222-222222222222', 'boosters_opened', null), 2, 'sanity: two openings');

-- Anonymous trial ----------------------------------------------------------------
select is((select stock::int from public.booster_state where user_id = '44444444-4444-4444-4444-444444444444'), 2,
  'an anonymous account starts with the trial boosters');
set local role authenticated;
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select lives_ok($$select public.open_booster('free', 'anon-open-' || g) from generate_series(1, 2) g$$,
  'the trial boosters can be opened');
reset role;
update public.booster_state set stock = 5 where user_id = '44444444-4444-4444-4444-444444444444';
set local role authenticated;
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select throws_ok($$select public.open_booster('free', 'anon-open-3')$$, 'P0001', 'link_account_required',
  'after the trial, the account must be linked');
select throws_ok($$select public.open_booster('daily', 'anon-daily-1')$$, 'P0001', 'link_account_required',
  'no daily booster before linking');
select throws_ok($$select public.claim_login_streak()$$, 'P0001', 'link_account_required', 'no rewards before linking');
reset role;
update auth.users set is_anonymous = false where id = '44444444-4444-4444-4444-444444444444';
set local role authenticated;
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select lives_ok($$select public.open_booster('free', 'anon-open-4')$$, 'a linked account plays normally');
reset role;
select is((private.purge_expired_data() ->> 'anonymous_deleted')::int, 1, 'idle anonymous accounts are purged');
select ok(not exists (select 1 from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
  'their data goes with them');

-- Grading -----------------------------------------------------------------------------
insert into public.ledger (user_id, amount, reason, idempotency_key)
values ('33333333-3333-3333-3333-333333333333', 2000, 'admin_adjustment', 'test-credit-grading');
insert into public.user_cards (user_id, player_id, quantity)
select '33333333-3333-3333-3333-333333333333', id, 2 from public.players where slug in ('soc-1-1', 'soc-1-2', 'soc-2-1', 'soc-2-2');
set local role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select lives_ok(format('select public.submit_grading(%s, %L)', (select id from public.players where slug = 'soc-1-1'), 'grade-0001'),
  'a card can be sent to grading');
select is((public.get_graded_cards() -> 0 -> 'grade'), 'null'::jsonb, 'the grade stays hidden until ready');
select throws_ok('select grade from public.graded_cards', '42501', null, 'the table itself is unreadable');
select is((public.recycle_preview() ->> 'copies')::int, 4, 'the graded copy counts as the kept one');
select lives_ok(format('select public.submit_grading(%s, %L)', (select id from public.players where slug = 'soc-1-1'), 'grade-0002'),
  'a second copy can be graded');
select throws_ok(format('select public.submit_grading(%s, %L)', (select id from public.players where slug = 'soc-1-1'), 'grade-0003'),
  'P0001', 'no_ungraded_copy', 'never more graded copies than owned');
select lives_ok(format('select public.submit_grading(%s, %L)', (select id from public.players where slug = 'soc-1-2'), 'grade-0004'),
  'third grading');
select throws_ok(format('select public.submit_grading(%s, %L)', (select id from public.players where slug = 'soc-2-1'), 'grade-0005'),
  'P0001', 'grading_queue_full', 'at most 3 gradings at once');
reset role;
select is((select -sum(amount)::int from public.ledger where reason = 'grading'), 3 * 40, 'fees are debited by rarity');
update public.graded_cards set ready_at = now() - interval '1 minute';
set local role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select ok((public.get_graded_cards() -> 0 ->> 'grade')::int between 6 and 10, 'the grade shows once ready');
reset role;

-- Push notifications ----------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select lives_ok($$select public.save_push_subscription('https://push.example/abc', 'key', 'auth')$$,
  'a device can subscribe');
reset role;
update public.booster_state set stock = 9, last_refill_at = now() - interval '20 minutes'
where user_id = '33333333-3333-3333-3333-333333333333';
select is((select count(*)::int from jsonb_array_elements(public.take_due_notifications()) n
           where n ->> 'kind' = 'stock_full'), 1, 'a full stock triggers one notification');
select is((select count(*)::int from jsonb_array_elements(public.take_due_notifications()) n
           where n ->> 'kind' = 'stock_full'), 0, 'only once per refill cycle');

select * from finish();
rollback;
