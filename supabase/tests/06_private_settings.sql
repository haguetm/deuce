-- Anti-abuse settings stay out of reach of clients.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select public.set_private_setting('example_threshold', '1');

set local role anon;
select throws_ok('select * from private.settings', '42501', null, 'anon cannot read private settings');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok('select * from private.settings', '42501', null, 'authenticated cannot read private settings');
select throws_ok($$select public.set_private_setting('example_threshold', '0')$$, '42501', null,
  'authenticated cannot change a private setting');
reset role;

select is(private.setting('example_threshold'), '1'::jsonb, 'game functions can read a setting');
select throws_ok($$select private.setting('missing_key')$$, 'P0002', null, 'a missing setting fails loudly');

select * from finish();
rollback;
