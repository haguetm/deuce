-- Structural guarantees: RLS everywhere, no client write privilege, no
-- unexpected callable function.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'RLS is enabled on every public table');

select is_empty($$
  select c.relname, r.rolname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) r(rolname)
  where n.nspname = 'public' and c.relkind in ('r', 'v')
    and (has_table_privilege(r.rolname, c.oid, 'INSERT')
      or has_table_privilege(r.rolname, c.oid, 'UPDATE')
      or has_table_privilege(r.rolname, c.oid, 'DELETE')
      or has_table_privilege(r.rolname, c.oid, 'TRUNCATE'))
$$, 'anon and authenticated cannot write any public table directly');

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'SELECT')
    and c.relname not in ('data_sources', 'players', 'game_config', 'player_images')
$$, 'anon can only read the public catalogue tables (card fronts included)');

select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
$$, array['is_admin', 'catalog_number', 'catalog_size', 'get_public_profile', 'get_big_pulls',
         'get_global_stats', 'get_shared_opening'],
   'anon can execute only is_admin() and the public read helpers');

select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
$$, array['is_admin', 'admin_set_image_hidden', 'open_booster', 'get_booster_state',
         'set_wishlist', 'recycle_preview', 'recycle_duplicates', 'catalog_number', 'catalog_size',
         'get_albums', 'get_quests', 'claim_login_streak', 'claim_quests',
         'set_username', 'set_profile_preferences', 'set_showcase', 'get_my_profile', 'get_public_profile',
         'get_big_pulls', 'get_global_stats', 'share_opening', 'get_shared_opening', 'claim_referral',
         'get_referral_status', 'submit_grading', 'get_graded_cards', 'save_push_subscription',
         'delete_push_subscription', 'get_push_subscription', 'get_collection', 'get_card_back'],
   'authenticated can execute only the whitelisted functions');

select * from finish();
rollback;
