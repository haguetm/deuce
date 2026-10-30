-- Grading: the owner sends one copy of a card for game_config.grading
-- .duration_hours and pays a fee in aces by rarity. The copy then carries a
-- final grade (6 to 10) and a certificate number. The grade is drawn at
-- submission from the server CSPRNG, but no client can read it before the
-- delay is over (no table privilege, read through get_graded_cards()).
-- Graded copies are never recycled.

create table public.graded_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  player_id bigint not null references public.players (id),
  request_id text not null check (length(request_id) between 8 and 100),
  grade smallint not null check (grade between 6 and 10),
  certificate text not null unique,
  fee integer not null check (fee >= 0),
  submitted_at timestamptz not null default now(),
  ready_at timestamptz not null,
  unique (user_id, request_id)
);
create index graded_cards_user_idx on public.graded_cards (user_id, player_id);
alter table public.graded_cards enable row level security;
-- No SELECT grant: the grade must stay hidden until ready_at.

create or replace function private.recyclable_copies(p_uid uuid, p_player_id bigint, p_quantity integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, p_quantity - greatest(1,
    (select count(*)::integer from public.graded_cards where user_id = p_uid and player_id = p_player_id)));
$$;

create function private.draw_grade(p_u double precision)
returns smallint
language plpgsql
stable
set search_path = ''
as $$
declare
  weights jsonb := private.config('grading') -> 'grade_weights';
  total numeric := 0;
  acc numeric := 0;
  g integer;
begin
  for g in 6..10 loop
    total := total + coalesce((weights ->> g::text)::numeric, 0);
  end loop;
  for g in 6..10 loop
    acc := acc + coalesce((weights ->> g::text)::numeric, 0);
    if p_u * total < acc then
      return g;
    end if;
  end loop;
  return 10;
end;
$$;

create function public.submit_grading(p_player_id bigint, p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cfg jsonb := private.config('grading');
  qty integer;
  graded integer;
  rarity public.rarity_tier;
  fee integer;
  existing public.graded_cards;
  card public.graded_cards;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_request_id is null or length(p_request_id) not between 8 and 100 then
    raise exception 'invalid_request_id' using errcode = 'invalid_parameter_value';
  end if;
  perform private.check_trial(uid, 'bonus');
  perform 1 from public.booster_state where user_id = uid for update;

  select * into existing from public.graded_cards where user_id = uid and request_id = p_request_id;
  if found then
    return jsonb_build_object('id', existing.id, 'ready_at', existing.ready_at, 'replayed', true);
  end if;

  select uc.quantity, p.rarity_effective into qty, rarity
  from public.user_cards uc join public.players p on p.id = uc.player_id
  where uc.user_id = uid and uc.player_id = p_player_id;
  if qty is null then
    raise exception 'not_owned' using errcode = 'P0001';
  end if;
  select count(*) into graded from public.graded_cards where user_id = uid and player_id = p_player_id;
  if graded >= qty then
    raise exception 'no_ungraded_copy' using errcode = 'P0001';
  end if;
  if (select count(*) from public.graded_cards where user_id = uid and ready_at > now())
       >= (cfg ->> 'max_concurrent')::integer then
    raise exception 'grading_queue_full' using errcode = 'P0001';
  end if;

  fee := (cfg -> 'fees' ->> rarity::text)::integer;
  if (select coalesce(sum(amount), 0) from public.ledger where user_id = uid) < fee then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  insert into public.graded_cards (user_id, player_id, request_id, grade, certificate, fee, ready_at)
  values (uid, p_player_id, p_request_id,
          private.draw_grade(private.rand_unit(extensions.gen_random_bytes(32), 'grade')),
          upper(encode(extensions.gen_random_bytes(5), 'hex')),
          fee, now() + make_interval(hours => (cfg ->> 'duration_hours')::integer))
  returning * into card;

  if fee > 0 then
    insert into public.ledger (user_id, amount, reason, ref, idempotency_key)
    values (uid, -fee, 'grading', card.id::text, 'grading:' || uid || ':' || p_request_id);
  end if;

  return jsonb_build_object('id', card.id, 'ready_at', card.ready_at, 'replayed', false);
end;
$$;

-- The caller's graded copies; the grade appears once ready.
create function public.get_graded_cards()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'player_id', g.player_id, 'name', p.name, 'rarity', p.rarity_effective,
           'certificate', g.certificate, 'submitted_at', g.submitted_at, 'ready_at', g.ready_at,
           'grade', case when g.ready_at <= now() then g.grade end)
         order by g.submitted_at desc), '[]'::jsonb)
  from public.graded_cards g
  join public.players p on p.id = g.player_id
  where g.user_id = auth.uid();
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.submit_grading(bigint, text), public.get_graded_cards() from public, anon;
grant execute on function public.submit_grading(bigint, text), public.get_graded_cards() to authenticated;
