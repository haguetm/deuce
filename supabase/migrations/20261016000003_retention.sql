-- Data retention.
--   * admin_audit_log: kept 3 years, then deleted.
--   * takedown_requests: requester contact details and free-text reason are
--     erased 12 months after the request was handled, unless it is flagged as
--     a dispute ("litige"). The anonymized record (dates, status, target,
--     requester role) is kept.
-- The purge runs daily (pg_cron when available, see bottom of file).

alter table public.takedown_requests
  add column dispute boolean not null default false,
  add column anonymized_at timestamptz,
  alter column requester_name drop not null,
  alter column requester_email drop not null,
  alter column reason drop not null;

alter table public.takedown_requests
  add constraint takedown_contact_present_unless_anonymized check (
    anonymized_at is not null
    or (requester_name is not null and requester_email is not null and reason is not null)
  );

-- The audit log stays append-only for everyone; the only exception is the
-- retention purge below, which sets a transaction-local flag.
create or replace function public.audit_forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('deuce.retention_purge', true) = 'on'
     and old.at < now() - interval '3 years' then
    return old;
  end if;
  raise exception 'admin_audit_log is append-only (% refused)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

-- Safe: not callable by clients (no grant); deletes only rows past their
-- retention period and anonymizes only handled, non-disputed requests.
create function private.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_deleted integer;
  takedowns_anonymized integer;
begin
  perform set_config('deuce.retention_purge', 'on', true);
  delete from public.admin_audit_log where at < now() - interval '3 years';
  get diagnostics audit_deleted = row_count;
  perform set_config('deuce.retention_purge', 'off', true);

  update public.takedown_requests
  set requester_name = null,
      requester_email = null,
      reason = null,
      anonymized_at = now()
  where anonymized_at is null
    and not dispute
    and status <> 'pending'
    and handled_at < now() - interval '12 months';
  get diagnostics takedowns_anonymized = row_count;

  if audit_deleted > 0 or takedowns_anonymized > 0 then
    perform public.write_audit('retention.purge', 'retention', current_date::text,
      jsonb_build_object('audit_deleted', audit_deleted, 'takedowns_anonymized', takedowns_anonymized));
  end if;

  return jsonb_build_object('audit_deleted', audit_deleted, 'takedowns_anonymized', takedowns_anonymized);
end;
$$;
revoke execute on function private.purge_expired_data() from public, anon, authenticated;

-- Daily schedule when pg_cron is available (Supabase). Elsewhere (plain
-- Postgres test bench) the function can be called by hand.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('deuce-retention-purge', '17 3 * * *', 'select private.purge_expired_data()');
  end if;
end;
$$;
