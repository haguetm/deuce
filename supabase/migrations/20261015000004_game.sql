-- Game state. Clients never write these tables directly: every mutation goes
-- through SECURITY DEFINER functions (tasks 5, 10, 11) that check the caller,
-- lock the relevant rows and validate the move inside one transaction.

create table public.game_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.game_config is
  'Game parameters synced from config/game.ts. Public: drop rates must be transparent.';

create table public.user_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  player_id bigint not null references public.players (id),
  quantity integer not null check (quantity >= 1),
  first_obtained_at timestamptz not null default now(),
  last_obtained_at timestamptz not null default now(),
  primary key (user_id, player_id)
);
create index user_cards_player_idx on public.user_cards (player_id);

create table public.booster_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stock smallint not null default 1 check (stock >= 0),   -- free boosters, capped in open/refill logic
  last_refill_at timestamptz not null default now(),       -- stock is recomputed lazily from this
  bonus_stock integer not null default 0 check (bonus_stock >= 0), -- referral rewards, not capped
  aces_purchases_day date,                                 -- daily cap for aces -> booster
  aces_purchases_count smallint not null default 0 check (aces_purchases_count >= 0)
);

create table public.booster_openings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opened_at timestamptz not null default now(),
  source public.booster_source not null,
  edition text,                                           -- e.g. 'ao2027', null = standard
  seed bytea not null                                     -- server-side randomness, kept for audit
);
create index booster_openings_user_idx on public.booster_openings (user_id, opened_at desc);

create table public.booster_opening_cards (
  opening_id uuid not null references public.booster_openings (id) on delete cascade,
  slot smallint not null check (slot between 1 and 10),
  player_id bigint not null references public.players (id),
  rarity public.rarity_tier not null,                     -- rarity at draw time
  was_new boolean not null,                               -- first copy for this user
  primary key (opening_id, slot)
);
create index booster_opening_cards_player_idx on public.booster_opening_cards (player_id);

-- Append-only currency ledger. Balance = sum(amount). Guarantees:
--   * no UPDATE, ever (trigger below);
--   * no DELETE, except the cascade when the account itself is deleted (GDPR);
--   * balance can never go negative (constraint trigger, serialized per user);
--   * each operation carries a unique idempotency key, so a retried request
--     cannot credit or debit twice.
create table public.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason public.ledger_reason not null,
  ref text,                                               -- related entity (opening id, referral id...)
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index ledger_user_idx on public.ledger (user_id);

create view public.balances
with (security_invoker = true) as
  select user_id, sum(amount)::bigint as balance
  from public.ledger
  group by user_id;

-- SECURITY DEFINER only to read auth.users during an account-deletion cascade.
create function public.ledger_forbid_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = old.user_id) then
    -- Cascade from an account deletion: the user row is already gone.
    return old;
  end if;
  raise exception 'ledger is append-only (% refused)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger ledger_no_update
  before update on public.ledger
  for each row execute function public.ledger_forbid_mutation();

create trigger ledger_no_delete
  before delete on public.ledger
  for each row execute function public.ledger_forbid_mutation();

create function public.ledger_check_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_balance bigint;
begin
  -- Serialize balance checks per user so two concurrent debits cannot both
  -- pass against the same starting balance.
  perform pg_advisory_xact_lock(hashtextextended('ledger:' || new.user_id::text, 0));
  select coalesce(sum(amount), 0) into current_balance
  from public.ledger where user_id = new.user_id;
  if current_balance < 0 then
    raise exception 'insufficient balance for user %', new.user_id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger ledger_non_negative
  after insert on public.ledger
  for each row execute function public.ledger_check_balance();

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  referee_id uuid not null unique references auth.users (id) on delete cascade, -- one referrer per account
  status public.referral_status not null default 'pending',
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  check (referrer_id <> referee_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id);

-- New account -> profile + booster state with one booster ready.
-- SECURITY DEFINER because it runs as the auth service inserting into auth.users.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.booster_state (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
