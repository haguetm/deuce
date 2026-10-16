-- Booster loop: stock, refill, opening, idempotency, guarantee, aces purchase.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local');

-- 4 fictional players per tier
insert into public.players (wikidata_id, slug, name, sex, rarity)
select 'Q' || (900000000 + t.n * 10 + i), 'card-' || t.n || '-' || i, 'Card ' || t.n || '-' || i, 'male', t.tier
from (select tier, row_number() over () as n from unnest(enum_range(null::public.rarity_tier)) tier) t,
     generate_series(1, 4) i;

create temp table results (n serial, body jsonb);
grant all on results to authenticated;
grant usage on sequence results_n_seq to authenticated;

-- anon cannot open
set local role anon;
select throws_ok($$select public.open_booster('free', 'request-anon-1')$$, '42501', null, 'anon cannot open a booster');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((public.get_booster_state() ->> 'stock')::int, 1, 'new account starts with one booster');
insert into results (body) select public.open_booster('free', 'request-0000-0001');
select is(jsonb_array_length((select body -> 'cards' from results where n = 1)), 5, 'a booster holds 5 cards');
select is((select (body -> 'state' ->> 'stock')::int from results where n = 1), 0, 'opening consumes one booster');
select throws_ok($$select public.open_booster('free', 'request-0000-0002')$$, 'P0001', 'no_booster_available',
  'cannot open without stock');
select throws_ok($$select public.open_booster('free', 'short')$$, '22023', 'invalid_request_id', 'request id is validated');

-- Idempotent replay
insert into results (body) select public.open_booster('free', 'request-0000-0001');
select is((select body ->> 'opening_id' from results where n = 2), (select body ->> 'opening_id' from results where n = 1),
  'replaying a request id returns the same opening');
select is((select (body ->> 'replayed')::boolean from results where n = 2), true, 'replay is flagged');
select is((select sum(quantity)::int from public.user_cards), 5, 'replay does not grant cards twice');
reset role;

-- Refill: 47 minutes after an empty stock -> 3 boosters, next one 13 minutes later
update public.booster_state set stock = 0, last_refill_at = now() - interval '47 minutes'
where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((public.get_booster_state() ->> 'stock')::int, 3, 'one booster every 15 minutes');
select is((public.get_booster_state() ->> 'next_refill_at')::timestamptz, now() + interval '13 minutes',
  'next refill is computed from the last full interval');
reset role;

-- Cap
update public.booster_state set stock = 2, last_refill_at = now() - interval '10 days'
where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((public.get_booster_state() ->> 'stock')::int, 10, 'stock is capped at 10');
select is(public.get_booster_state() -> 'next_refill_at', 'null'::jsonb, 'no refill timer while full');

-- 10 openings drain the stock; the timer starts at the first opening
select lives_ok($$select public.open_booster('free', 'request-loop-' || g) from generate_series(1, 10) g$$,
  'ten boosters can be opened from a full stock');
select is((public.get_booster_state() ->> 'stock')::int, 0, 'stock is empty after ten openings');
reset role;

-- Guarantee and card accounting over many openings
update public.booster_state set stock = 10, last_refill_at = now() where user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  for i in 1..300 loop
    update public.booster_state set stock = 10 where user_id = '11111111-1111-1111-1111-111111111111';
    perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
    perform public.open_booster('free', 'request-bulk-' || i);
  end loop;
end;
$$;
select is_empty($$select 1 from public.booster_opening_cards where slot = 5 and rarity = 'common'$$,
  'last slot is always uncommon or better');
select is((select sum(quantity)::int from public.user_cards where user_id = '11111111-1111-1111-1111-111111111111'),
          (select count(*)::int from public.booster_opening_cards c join public.booster_openings o on o.id = c.opening_id
           where o.user_id = '11111111-1111-1111-1111-111111111111'),
  'every drawn card is in the collection exactly once');
select is((select count(*)::int from public.booster_opening_cards where was_new),
          (select count(*)::int from public.user_cards where user_id = '11111111-1111-1111-1111-111111111111'),
  'was_new is set once per distinct card');

-- Bonus boosters
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok($$select public.open_booster('bonus', 'request-bonus-1')$$, 'P0001', 'no_booster_available', 'no bonus booster yet');
reset role;
update public.booster_state set bonus_stock = 1 where user_id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok($$select public.open_booster('bonus', 'request-bonus-2')$$, 'bonus booster opens');
select is((public.get_booster_state() ->> 'stock')::int, 1, 'bonus opening leaves the free stock untouched');

-- Aces purchase
select throws_ok($$select public.open_booster('aces', 'request-aces-1')$$, 'P0001', 'insufficient_balance',
  'cannot buy a booster without aces');
reset role;
insert into public.ledger (user_id, amount, reason, idempotency_key)
values ('22222222-2222-2222-2222-222222222222', 1000, 'admin_adjustment', 'test-credit');
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok($$select public.open_booster('aces', 'request-aces-' || g) from generate_series(2, 4) g$$,
  'three aces boosters per day');
select throws_ok($$select public.open_booster('aces', 'request-aces-5')$$, 'P0001', 'daily_cap_reached', 'daily cap enforced');
reset role;
select is((select sum(amount)::int from public.ledger where user_id = '22222222-2222-2222-2222-222222222222'), 700,
  'each aces booster debits 100 aces once');

select * from finish();
rollback;
