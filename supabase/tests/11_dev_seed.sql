-- Fictional dev rows never exist outside a development database.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is_empty('select 1 from public.players where is_dev_seed',
  'no dev seed row in this (non-development) database');

select throws_ok($$insert into public.players (wikidata_id, slug, name, sex, is_dev_seed)
  values ('Q999000001', 'dev-test', 'Dev Test', 'male', true)$$, '23514', null,
  'dev seed rows are refused without app.environment = development');

insert into public.players (wikidata_id, slug, name, sex) values ('Q999000002', 'dev-test-2', 'Dev Test 2', 'female');
select throws_ok($$update public.players set is_dev_seed = true where wikidata_id = 'Q999000002'$$, '23514', null,
  'an existing row cannot be flagged as dev seed outside development');

select set_config('app.environment', 'development', true);
select lives_ok($$insert into public.players (wikidata_id, slug, name, sex, is_dev_seed)
  values ('Q999000003', 'dev-test-3', 'Dev Test 3', 'male', true)$$,
  'the dev seed script (app.environment = development) can insert them');

select * from finish();
rollback;
