-- Anonymous trial: a visitor can open game_config.anonymous_trial.boosters
-- free boosters without an account (Supabase anonymous sign-in, started by
-- an explicit click), then links Discord, Google or an email to keep the
-- cards. Until then, every other source of boosters, aces and rewards is
-- refused with 'link_account_required'.
-- Unlinked anonymous accounts idle for purge_after_days are deleted by the
-- daily purge (cascade: cards, openings, ledger).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.booster_state (user_id, stock)
  values (new.id, case when coalesce(new.is_anonymous, false)
                       then (private.config('anonymous_trial') ->> 'boosters')::integer
                       else 1 end);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function private.check_trial(p_uid uuid, p_source public.booster_source)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce((select is_anonymous from auth.users where id = p_uid), false) then
    return;
  end if;
  if p_source <> 'free'
     or (select count(*) from public.booster_openings where user_id = p_uid)
          >= (private.config('anonymous_trial') ->> 'boosters')::integer then
    raise exception 'link_account_required' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.check_trial(uuid, public.booster_source) from public, anon, authenticated;

-- Same purge as before, plus idle anonymous accounts.
create or replace function private.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_deleted integer;
  takedowns_anonymized integer;
  anonymous_deleted integer;
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

  delete from auth.users
  where is_anonymous
    and coalesce(last_sign_in_at, created_at)
        < now() - make_interval(days => (private.config('anonymous_trial') ->> 'purge_after_days')::integer);
  get diagnostics anonymous_deleted = row_count;

  if audit_deleted > 0 or takedowns_anonymized > 0 or anonymous_deleted > 0 then
    perform public.write_audit('retention.purge', 'retention', current_date::text,
      jsonb_build_object('audit_deleted', audit_deleted, 'takedowns_anonymized', takedowns_anonymized,
                         'anonymous_deleted', anonymous_deleted));
  end if;

  return jsonb_build_object('audit_deleted', audit_deleted, 'takedowns_anonymized', takedowns_anonymized,
                            'anonymous_deleted', anonymous_deleted);
end;
$$;
revoke execute on function private.purge_expired_data() from public, anon, authenticated;
