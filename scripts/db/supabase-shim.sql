-- Minimal emulation of the Supabase platform objects the migrations rely on.
-- Used ONLY by scripts/db/test-plain-postgres.sh when Docker (and therefore
-- `supabase start`) is unavailable. CI runs the real Supabase stack.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant anon, authenticated, service_role to current_user;

create schema extensions;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public, extensions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants broad table privileges by default; reproduce that so the
-- migrations' explicit revokes are actually exercised.
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
