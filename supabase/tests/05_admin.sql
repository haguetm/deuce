-- One-click photo masking and audit trail.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@test.local'),
  ('99999999-9999-9999-9999-999999999999', 'admin@test.local');
insert into public.admins (user_id) values ('99999999-9999-9999-9999-999999999999');
insert into public.players (id, wikidata_id, slug, name, sex) overriding system value values
  (1, 'Q1', 'p-one', 'P One', 'male');
insert into public.player_images (id, player_id, commons_file, storage_path, author, license, license_url, source_url)
  overriding system value values
  (10, 1, 'File:One.jpg', 'p/1.webp', 'A', 'CC BY 4.0', 'https://cc/by', 'https://commons/One');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$select public.admin_set_image_hidden(10, true, 'test')$$, '42501', null,
  'non-admin cannot hide a photo');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
select lives_ok($$select public.admin_set_image_hidden(10, true, 'demande du joueur')$$, 'admin hides a photo in one call');
select throws_ok($$select public.admin_set_image_hidden(12345, true, null)$$, 'P0002', null, 'unknown image is reported');
reset role;

select results_eq('select hidden from public.player_images where id = 10', array[true], 'photo is hidden');
select results_eq($$select action || ':' || actor_id::text from public.admin_audit_log where target_table = 'player_images'$$,
  array['image.hide:99999999-9999-9999-9999-999999999999'], 'hiding is audited with the admin id');

update public.players set rarity_override = 'mythic' where id = 1;
select results_eq('select rarity_effective::text from public.players where id = 1', array['mythic'],
  'SQL rarity correction takes effect');
select results_eq($$select action from public.admin_audit_log where target_table = 'players'$$,
  array['player.rarity_override'], 'SQL rarity correction is audited');

select throws_ok('delete from public.admin_audit_log', '42501', null, 'audit log is append-only');

select * from finish();
rollback;
