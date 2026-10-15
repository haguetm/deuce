-- User profiles (data minimization: pseudo + preferences only; email and
-- OAuth identity stay in auth.users) and the admin allow-list.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  age_confirmed_at timestamptz,          -- "15+ or parental consent" checkbox
  referral_code text not null unique
    default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

create unique index profiles_username_lower_idx on public.profiles (lower(username));

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- SECURITY DEFINER so policies can call it without granting read access on
-- public.admins. It only answers "is the caller an admin", nothing else.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
