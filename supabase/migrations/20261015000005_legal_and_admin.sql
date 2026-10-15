-- Takedown requests, admin audit log and the one-click photo masking.

create table public.takedown_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requester_name text not null check (length(requester_name) between 1 and 200),
  requester_email text not null check (requester_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  requester_role text not null check (requester_role in ('subject', 'representative', 'photographer', 'other')),
  player_id bigint references public.players (id) on delete set null,
  image_id bigint references public.player_images (id) on delete set null,
  page_url text,
  reason text not null check (length(reason) between 10 and 5000),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  status public.takedown_status not null default 'pending',
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  resolution_note text
);
create index takedown_requests_status_idx on public.takedown_requests (status, created_at);

-- Append-only audit trail of every moderation action. Rows are written by
-- triggers and admin functions only.
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,                 -- auth.uid() of the admin, null for direct SQL
  actor_role text not null,      -- database role (e.g. 'postgres' for SQL corrections)
  action text not null,
  target_table text not null,
  target_id text not null,
  details jsonb not null default '{}'
);
create index admin_audit_log_target_idx on public.admin_audit_log (target_table, target_id);

create function public.audit_forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log is append-only (% refused)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function public.audit_forbid_mutation();

create function public.write_audit(
  p_action text, p_table text, p_target text, p_details jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (actor_id, actor_role, action, target_table, target_id, details)
  values (auth.uid(), session_user, p_action, p_table, p_target, coalesce(p_details, '{}'));
$$;
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;

-- Audit triggers: whatever the path (admin UI, SQL console, pipeline), a change
-- to a moderation-relevant column leaves a trace.
create function public.audit_player_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hidden is distinct from old.hidden then
    perform public.write_audit(
      case when new.hidden then 'image.hide' else 'image.unhide' end,
      'player_images', new.id::text,
      jsonb_build_object('player_id', new.player_id, 'reason', new.hidden_reason)
    );
  end if;
  return new;
end;
$$;

create trigger player_images_audit
  after update on public.player_images
  for each row execute function public.audit_player_images();

create function public.audit_players()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rarity_override is distinct from old.rarity_override then
    perform public.write_audit('player.rarity_override', 'players', new.id::text,
      jsonb_build_object('from', old.rarity_override, 'to', new.rarity_override,
                         'computed', new.rarity));
  end if;
  if new.in_catalog is distinct from old.in_catalog then
    perform public.write_audit('player.in_catalog', 'players', new.id::text,
      jsonb_build_object('in_catalog', new.in_catalog));
  end if;
  return new;
end;
$$;

create trigger players_audit
  after update on public.players
  for each row execute function public.audit_players();

create function public.audit_takedown_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform public.write_audit('takedown.' || new.status::text, 'takedown_requests', new.id::text,
      jsonb_build_object('note', new.resolution_note));
  end if;
  return new;
end;
$$;

create trigger takedown_requests_audit
  after update on public.takedown_requests
  for each row execute function public.audit_takedown_requests();

-- One-click photo masking from the admin tool.
-- Safe: SECURITY DEFINER but refuses any caller that is not in public.admins;
-- it only toggles visibility fields, and the audit trigger records the action.
create function public.admin_set_image_hidden(
  p_image_id bigint, p_hidden boolean, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  update public.player_images
  set hidden = p_hidden,
      hidden_at = case when p_hidden then now() else null end,
      hidden_reason = case when p_hidden then p_reason else null end
  where id = p_image_id;

  if not found then
    raise exception 'image % not found', p_image_id using errcode = 'no_data_found';
  end if;
end;
$$;
revoke execute on function public.admin_set_image_hidden(bigint, boolean, text) from public, anon;
grant execute on function public.admin_set_image_hidden(bigint, boolean, text) to authenticated;
