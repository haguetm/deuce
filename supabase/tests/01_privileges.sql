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
    and c.relname not in ('data_sources', 'players', 'game_config')
$$, 'anon can only read the public catalogue tables');

select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
$$, array['is_admin'], 'anon can execute only is_admin()');

select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
$$, array['is_admin', 'admin_set_image_hidden'],
   'authenticated can execute only the whitelisted functions');

select * from finish();
rollback;
