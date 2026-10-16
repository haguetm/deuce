-- Private settings: anti-abuse thresholds and weights that must not be
-- published (the repository is public). Values come from environment
-- variables and are written by scripts/sync-private-settings.ts with the
-- service role. The `private` schema is not exposed by the API and clients
-- have no privilege on it.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
revoke all on private.settings from public, anon, authenticated;

-- Read helper for game functions (SECURITY DEFINER callers only).
-- Raises when a setting is missing, so a forgotten sync fails loudly instead
-- of silently disabling a protection.
create function private.setting(p_key text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb;
begin
  select value into v from private.settings where key = p_key;
  if v is null then
    raise exception 'private setting % is not configured', p_key
      using errcode = 'no_data_found';
  end if;
  return v;
end;
$$;
revoke execute on function private.setting(text) from public, anon, authenticated;

-- Write path used by the sync script. Safe: executable by service_role only.
create function public.set_private_setting(p_key text, p_value jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;
revoke execute on function public.set_private_setting(text, jsonb) from public, anon, authenticated;
grant execute on function public.set_private_setting(text, jsonb) to service_role;
