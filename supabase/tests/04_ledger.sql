-- Currency invariants enforced by the database itself, whatever the caller.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'u1@test.local');

select lives_ok($$insert into public.ledger (user_id, amount, reason, idempotency_key)
  values ('11111111-1111-1111-1111-111111111111', 10, 'recycle', 'c1')$$, 'credit accepted');
select lives_ok($$insert into public.ledger (user_id, amount, reason, idempotency_key)
  values ('11111111-1111-1111-1111-111111111111', -5, 'booster_purchase', 'd1')$$, 'debit within balance accepted');
select throws_ok($$insert into public.ledger (user_id, amount, reason, idempotency_key)
  values ('11111111-1111-1111-1111-111111111111', -6, 'booster_purchase', 'd2')$$, '23514', null,
  'debit beyond balance refused (no negative balance)');
select throws_ok($$insert into public.ledger (user_id, amount, reason, idempotency_key)
  values ('11111111-1111-1111-1111-111111111111', 0, 'recycle', 'z1')$$, '23514', null, 'zero amount refused');
select throws_ok($$insert into public.ledger (user_id, amount, reason, idempotency_key)
  values ('11111111-1111-1111-1111-111111111111', 10, 'recycle', 'c1')$$, '23505', null,
  'replayed idempotency key refused (no double credit)');
select results_eq($$select balance from public.balances where user_id = '11111111-1111-1111-1111-111111111111'$$,
  array[5::bigint], 'balance is the sum of accepted lines');
select throws_ok('update public.ledger set amount = 1000', '42501', null, 'ledger lines cannot be updated, even by the owner role');
select throws_ok('delete from public.ledger', '42501', null, 'ledger lines cannot be deleted directly');

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is_empty('select 1 from public.ledger', 'account deletion removes its ledger lines (GDPR)');

select * from finish();
rollback;
