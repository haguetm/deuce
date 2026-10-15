-- A player can neither read nor modify another player's data, and cannot
-- write any game table directly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'u3@test.local');

select results_eq('select count(*)::int from public.profiles', array[3], 'signup creates a profile');
select results_eq('select stock::int from public.booster_state where user_id = ''11111111-1111-1111-1111-111111111111''',
  array[1], 'signup creates a booster state with one booster');

insert into public.players (id, wikidata_id, slug, name, sex) overriding system value values
  (1, 'Q1', 'p-one', 'P One', 'male'), (2, 'Q2', 'p-two', 'P Two', 'female');
insert into public.user_cards (user_id, player_id, quantity) values
  ('11111111-1111-1111-1111-111111111111', 1, 2),
  ('22222222-2222-2222-2222-222222222222', 2, 1);
insert into public.booster_openings (id, user_id, source, seed) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'free', '\x00'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'free', '\x01');
insert into public.booster_opening_cards (opening_id, slot, player_id, rarity, was_new) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 1, 1, 'common', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 1, 2, 'common', true);
insert into public.ledger (user_id, amount, reason, idempotency_key) values
  ('11111111-1111-1111-1111-111111111111', 5, 'recycle', 'k1'),
  ('22222222-2222-2222-2222-222222222222', 7, 'recycle', 'k2');
insert into public.referrals (referrer_id, referee_id) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
insert into public.takedown_requests (requester_name, requester_email, requester_role, reason)
  values ('X', 'x@test.local', 'subject', 'Merci de retirer cette photo.');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq('select count(*)::int from public.profiles', array[1], 'user sees only own profile');
select results_eq('select player_id from public.user_cards', array[1::bigint], 'user sees only own cards');
select results_eq('select count(*)::int from public.booster_state', array[1], 'user sees only own booster state');
select results_eq('select id from public.booster_openings',
  array['aaaaaaaa-0000-0000-0000-000000000001'::uuid], 'user sees only own openings');
select results_eq('select player_id from public.booster_opening_cards', array[1::bigint], 'user sees only own opening cards');
select results_eq('select amount from public.ledger', array[5], 'user sees only own ledger');
select results_eq('select balance from public.balances', array[5::bigint], 'user sees only own balance');
select results_eq('select count(*)::int from public.referrals', array[1], 'referrer sees the referral');
select is_empty('select 1 from public.takedown_requests', 'user cannot read takedown requests');
select is_empty('select 1 from public.admin_audit_log', 'user cannot read the audit log');

select throws_ok($$insert into public.user_cards (user_id, player_id, quantity)
  values ('11111111-1111-1111-1111-111111111111', 2, 1)$$, '42501', null, 'user cannot grant themselves a card');
select throws_ok($$update public.booster_state set stock = 10$$, '42501', null, 'user cannot refill their stock');
select throws_ok($$insert into public.ledger (user_id, amount, reason, idempotency_key)
  values ('11111111-1111-1111-1111-111111111111', 1000, 'admin_adjustment', 'hack')$$, '42501', null,
  'user cannot credit themselves');
select throws_ok($$delete from public.user_cards$$, '42501', null, 'user cannot delete cards');
select throws_ok($$update public.profiles set referral_code = 'stolen'$$, '42501', null, 'user cannot edit profile columns directly');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select results_eq('select count(*)::int from public.referrals', array[1], 'referee sees the referral');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is_empty('select 1 from public.referrals', 'third party sees no referral');
reset role;

select * from finish();
rollback;
