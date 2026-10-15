-- Row Level Security and privileges.
--
-- Model: clients (anon, authenticated) can only SELECT, and only what the
-- policies below allow. Every write goes through SECURITY DEFINER functions
-- or the service role (pipeline, server routes). Table privileges are revoked
-- first so that a missing policy can never turn into an open write path.

-- 1. Privileges -------------------------------------------------------------

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.data_sources, public.players, public.game_config to anon, authenticated;
grant select on
  public.player_stats, public.player_texts, public.player_images,
  public.profiles, public.user_cards, public.booster_state,
  public.booster_openings, public.booster_opening_cards,
  public.ledger, public.balances, public.referrals,
  public.takedown_requests, public.admin_audit_log
to authenticated;

-- Trigger functions are never called directly.
revoke execute on function
  public.handle_new_user(), public.ledger_forbid_mutation(), public.ledger_check_balance(),
  public.audit_forbid_mutation(), public.audit_player_images(), public.audit_players(),
  public.audit_takedown_requests()
from public, anon, authenticated;

-- Used inside policies, so callers need EXECUTE.
grant execute on function public.is_admin() to anon, authenticated;

-- 2. RLS on every table -----------------------------------------------------

alter table public.data_sources enable row level security;
alter table public.players enable row level security;
alter table public.player_stats enable row level security;
alter table public.player_images enable row level security;
alter table public.player_texts enable row level security;
alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.game_config enable row level security;
alter table public.user_cards enable row level security;
alter table public.booster_state enable row level security;
alter table public.booster_openings enable row level security;
alter table public.booster_opening_cards enable row level security;
alter table public.ledger enable row level security;
alter table public.referrals enable row level security;
alter table public.takedown_requests enable row level security;
alter table public.admin_audit_log enable row level security;

-- 3. Policies (SELECT only) -------------------------------------------------

-- Public catalogue data: needed for the public partial player page and the
-- odds page.
create policy "data sources are public" on public.data_sources
  for select to anon, authenticated using (true);

create policy "game config is public" on public.game_config
  for select to anon, authenticated using (true);

create policy "catalogue players are public" on public.players
  for select to anon, authenticated using (in_catalog or (select public.is_admin()));

-- Full card content (bio, stats, photo + credits) is unlocked by owning the card.
create policy "stats visible to card owners" on public.player_stats
  for select to authenticated using (
    exists (select 1 from public.user_cards uc
            where uc.player_id = player_stats.player_id and uc.user_id = (select auth.uid()))
    or (select public.is_admin())
  );

create policy "texts visible to card owners" on public.player_texts
  for select to authenticated using (
    exists (select 1 from public.user_cards uc
            where uc.player_id = player_texts.player_id and uc.user_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- Hidden photos are invisible to everyone but admins: masking takes effect at
-- the database level, whatever the client does.
create policy "visible images for card owners" on public.player_images
  for select to authenticated using (
    (not hidden and exists (select 1 from public.user_cards uc
            where uc.player_id = player_images.player_id and uc.user_id = (select auth.uid())))
    or (select public.is_admin())
  );

-- Personal game data: owner only.
create policy "own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "own cards" on public.user_cards
  for select to authenticated using (user_id = (select auth.uid()));

create policy "own booster state" on public.booster_state
  for select to authenticated using (user_id = (select auth.uid()));

create policy "own openings" on public.booster_openings
  for select to authenticated using (user_id = (select auth.uid()));

create policy "own opening cards" on public.booster_opening_cards
  for select to authenticated using (
    exists (select 1 from public.booster_openings o
            where o.id = booster_opening_cards.opening_id and o.user_id = (select auth.uid()))
  );

create policy "own ledger" on public.ledger
  for select to authenticated using (user_id = (select auth.uid()));

create policy "own referrals" on public.referrals
  for select to authenticated using (
    referrer_id = (select auth.uid()) or referee_id = (select auth.uid())
  );

-- Moderation data: admins only.
create policy "admins read takedowns" on public.takedown_requests
  for select to authenticated using ((select public.is_admin()));

create policy "admins read audit log" on public.admin_audit_log
  for select to authenticated using ((select public.is_admin()));

-- public.admins: no policy at all, readable only through is_admin().
