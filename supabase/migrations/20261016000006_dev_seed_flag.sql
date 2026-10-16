-- Fictional development data (pnpm db:seed:dev) is flagged with is_dev_seed.
-- The guard trigger refuses such rows unless the transaction declares
-- app.environment = 'development', which only the dev seed script does, so
-- they can never reach a production database by accident.

alter table public.players add column is_dev_seed boolean not null default false;

create function public.forbid_dev_seed_outside_dev()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_dev_seed and coalesce(current_setting('app.environment', true), '') <> 'development' then
    raise exception 'dev seed rows require app.environment = development'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.forbid_dev_seed_outside_dev() from public, anon, authenticated;

create trigger players_dev_seed_guard
  before insert or update of is_dev_seed on public.players
  for each row execute function public.forbid_dev_seed_outside_dev();
