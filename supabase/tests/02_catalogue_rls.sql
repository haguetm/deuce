-- Card front (photo + credit) is public; the back (stats, bio) is unlocked
-- by ownership; hidden photos are invisible to everyone but admins.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'other@test.local'),
  ('99999999-9999-9999-9999-999999999999', 'admin@test.local');
insert into public.admins (user_id) values ('99999999-9999-9999-9999-999999999999');

insert into public.players (id, wikidata_id, slug, name, sex, in_catalog) overriding system value values
  (1, 'Q1', 'player-one', 'Player One', 'male', true),
  (2, 'Q2', 'player-two', 'Player Two', 'female', true),
  (3, 'Q3', 'player-three', 'Player Three', 'male', false);
insert into public.player_stats (player_id, key, value_num, source_id) values
  (1, 'titles', 10, 'sackmann_atp'), (2, 'titles', 3, 'sackmann_wta');
insert into public.player_texts (player_id, lang, extract, article_url) values
  (1, 'fr', 'Bio un', 'https://fr.wikipedia.org/wiki/One'),
  (2, 'fr', 'Bio deux', 'https://fr.wikipedia.org/wiki/Two');
insert into public.player_images (player_id, commons_file, storage_path, author, license, license_url, source_url, is_primary, hidden) values
  (1, 'File:One.jpg', 'p/1.webp', 'A', 'CC BY 4.0', 'https://cc/by', 'https://commons/One', true, false),
  (1, 'File:One-old.jpg', 'p/1b.webp', 'B', 'CC BY 4.0', 'https://cc/by', 'https://commons/One-old', false, true),
  (2, 'File:Two.jpg', 'p/2.webp', 'C', 'CC BY 4.0', 'https://cc/by', 'https://commons/Two', true, false);
insert into public.user_cards (user_id, player_id, quantity) values
  ('11111111-1111-1111-1111-111111111111', 1, 1);

-- Anonymous visitor
set local role anon;
select results_eq('select id from public.players order by id', array[1::bigint, 2::bigint],
  'anon sees catalogue players only (not out-of-catalog)');
select throws_ok('select * from public.player_stats', '42501', null, 'anon cannot read stats');
select throws_ok('select * from public.player_texts', '42501', null, 'anon cannot read texts');
select results_eq('select commons_file from public.player_images order by commons_file',
  array['File:One.jpg', 'File:Two.jpg'], 'anon sees visible photos (card fronts), not hidden ones');
select results_eq($$select author || ' / ' || license from public.player_images where commons_file = 'File:One.jpg'$$,
  array['A / CC BY 4.0'], 'photo credit is readable wherever the photo is');
reset role;

-- Owner of player 1
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select results_eq('select player_id from public.player_stats', array[1::bigint], 'owner sees stats of owned card only');
select results_eq('select player_id from public.player_texts', array[1::bigint], 'owner sees texts of owned card only');
select results_eq($$select commons_file from public.player_images where player_id = 1$$, array['File:One.jpg'],
  'owner sees the visible photo, not the hidden one');
reset role;

-- Hiding the primary photo removes it immediately for the owner
update public.player_images set hidden = true where commons_file = 'File:One.jpg';
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is_empty('select 1 from public.player_images where player_id = 1', 'a hidden photo disappears for its owner');
reset role;

-- Another user without cards
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is_empty('select 1 from public.player_stats', 'non-owner sees no stats');
select is_empty('select 1 from public.player_texts', 'non-owner sees no texts');
select results_eq('select player_id from public.player_images', array[2::bigint], 'non-owner sees visible card fronts only');
select results_eq('select count(*)::int from public.players', array[2], 'non-owner still sees the public catalogue');
reset role;

-- Admin
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
select results_eq('select count(*)::int from public.player_images', array[3], 'admin sees every image, hidden included');
select results_eq('select count(*)::int from public.players', array[3], 'admin sees out-of-catalog players');
reset role;

select * from finish();
rollback;
